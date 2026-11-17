"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/events";
import { notifyApplicant } from "@/lib/notifications";
import { claimIdempotencyKey, finalizeIdempotencyKey } from "@/lib/idempotency";
import type { ApplicationStatus } from "@prisma/client";

async function requireStaff() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");
  return session.user;
}

/** Runs one bulk transition: every selected applicant whose current status
 * is in `eligibleFrom` moves to `toStatus`, each getting its own Event —
 * an applicant in the wrong state is skipped and counted, not silently
 * dropped or allowed to corrupt the batch.
 *
 * Idempotency key: the pipeline page mints one fresh key per page render
 * (see app/staff/page.tsx) and carries it in a hidden field. A network
 * retry or double-click resubmits the same key — this is a different
 * failure mode than isRealStatusChange (which guards repeated *correct*
 * submissions reaching the same state): here the "before" read and the
 * decision to redo it happen on an entirely new HTTP request, so there's
 * no in-memory state to dedupe against, only the key itself. Reloading the
 * page mints a new key, so a genuinely new bulk action is never blocked. */
async function runBulkTransition(
  formData: FormData,
  eligibleFrom: ApplicationStatus[],
  toStatus: ApplicationStatus,
  actionLabel: string,
) {
  const staff = await requireStaff();

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const claim = await claimIdempotencyKey(idempotencyKey, actionLabel);
  if (!claim.claimed) {
    redirect(`/staff?result=${encodeURIComponent(claim.resultMessage)}`);
  }

  const applicantIds = formData.getAll("applicantIds").map(String).filter(Boolean);
  const reason = String(formData.get("reason") ?? "").trim();

  if (applicantIds.length === 0) {
    redirect("/staff?error=Select+at+least+one+applicant");
  }
  if (!reason) {
    redirect("/staff?error=A+reason+is+required+for+bulk+actions");
  }

  const applicants = await prisma.applicant.findMany({
    where: { id: { in: applicantIds } },
    select: { id: true, status: true },
  });

  const eligible = applicants.filter((a) => eligibleFrom.includes(a.status));
  const skipped = applicants.length - eligible.length;

  if (eligible.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const a of eligible) {
        await tx.applicant.update({ where: { id: a.id }, data: { status: toStatus } });
        const event = await appendEvent(tx, {
          aggregateType: "Applicant",
          aggregateId: a.id,
          type: "APPLICANT_STATUS_CHANGED",
          payload: { fromStatus: a.status, toStatus, action: actionLabel, reason, actorId: staff.id, bulk: true },
        });
        if (toStatus === "REJECTED") {
          await appendEvent(tx, {
            aggregateType: "Applicant", aggregateId: a.id, type: "APPLICANT_REJECTED",
            payload: { stage: a.status, reason, actorId: staff.id, bulk: true },
            idempotencyKey: `applicant-rejected:bulk:${idempotencyKey}:${a.id}`,
          });
          await notifyApplicant(tx, a.id, event.id, "Application update", `Your application was not selected. Reason: ${reason}`);
        } else if (toStatus === "ACCEPTED") {
          await notifyApplicant(tx, a.id, event.id, "You have been selected", "Your application has been selected. Maatram staff will contact you about onboarding.");
        }
      }
    });
  }

  const message =
    `${actionLabel.replace("BULK_", "")}: updated ${eligible.length}` +
    (skipped > 0 ? `, skipped ${skipped} (wrong status for this action)` : "");

  await finalizeIdempotencyKey(idempotencyKey, message);

  redirect(`/staff?result=${encodeURIComponent(message)}`);
}

export async function bulkReject(formData: FormData) {
  await runBulkTransition(
    formData,
    ["SUBMITTED", "UNDER_VERIFICATION", "VERIFIED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEWED", "WAITLISTED"],
    "REJECTED",
    "BULK_REJECT",
  );
}
