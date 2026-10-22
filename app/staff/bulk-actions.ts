"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/events";
import type { ApplicationStatus } from "@prisma/client";

async function requireStaff() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");
  return session.user;
}

/** Runs one bulk transition: every selected applicant whose current status
 * is in `eligibleFrom` moves to `toStatus`, each getting its own Event —
 * an applicant in the wrong state is skipped and counted, not silently
 * dropped or allowed to corrupt the batch. */
async function runBulkTransition(
  formData: FormData,
  eligibleFrom: ApplicationStatus[],
  toStatus: ApplicationStatus,
  actionLabel: string,
) {
  const staff = await requireStaff();

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
        await appendEvent(tx, {
          aggregateType: "Applicant",
          aggregateId: a.id,
          type: "APPLICANT_STATUS_CHANGED",
          payload: { fromStatus: a.status, toStatus, action: actionLabel, reason, actorId: staff.id, bulk: true },
        });
      }
    });
  }

  const message =
    `${actionLabel.replace("BULK_", "")}: updated ${eligible.length}` +
    (skipped > 0 ? `, skipped ${skipped} (wrong status for this action)` : "");
  redirect(`/staff?result=${encodeURIComponent(message)}`);
}

export async function bulkShortlist(formData: FormData) {
  await runBulkTransition(formData, ["SUBMITTED", "UNDER_VERIFICATION", "VERIFIED"], "SHORTLISTED", "BULK_SHORTLIST");
}

export async function bulkSelect(formData: FormData) {
  await runBulkTransition(formData, ["SHORTLISTED", "INTERVIEWED"], "ACCEPTED", "BULK_SELECT");
}

export async function bulkReject(formData: FormData) {
  await runBulkTransition(
    formData,
    ["SUBMITTED", "UNDER_VERIFICATION", "VERIFIED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEWED", "WAITLISTED"],
    "REJECTED",
    "BULK_REJECT",
  );
}
