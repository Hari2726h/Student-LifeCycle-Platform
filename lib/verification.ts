import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { appendEvent, isRealStatusChange } from "@/lib/events";
import { notifyApplicant } from "@/lib/notifications";

export const verificationSchema = z.object({
  incomeBandVerified: z.coerce.boolean(),
  housingCondition: z.enum(["KUTCHA", "SEMI_PUCCA", "PUCCA"]),
  householdSizeConfirmed: z.coerce.number().int().min(1).max(30),
  photoEvidenceConfirmed: z.coerce.boolean(),
  duplicateCheckPassed: z.coerce.boolean(),
  decision: z.enum(["APPROVED", "REJECTED", "NEEDS_FOLLOW_UP"]),
  notes: z.string().optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export type VerificationResult = { ok: true } | { ok: false; error: string };

// The statuses a verification visit is actually allowed to act on. Past
// this point the applicant has moved on (interview stage, a committee
// decision, or onboarding) and a verification submission — especially one
// that was queued offline and could be syncing hours or days later —
// must not be able to drag them back to VERIFIED/UNDER_VERIFICATION/REJECTED.
const VERIFIABLE_STATUSES = ["SUBMITTED", "UNDER_VERIFICATION"];

/** The write path shared by the online form (a server action, same
 * request/response cycle) and the offline-queued submission (a plain API
 * route a service worker can retry later) — same validation, same
 * ownership check, same event-append rule, so a verification saved while
 * offline and synced minutes later is indistinguishable from one typed in
 * with a live connection.
 *
 * The status check matters most for the offline path: a submission queued
 * while the applicant was still SUBMITTED could otherwise sync after the
 * committee has already accepted/rejected them (or after onboarding),
 * silently reverting a later decision. */
export async function submitVerificationCore(
  applicantId: string,
  volunteerId: string,
  formData: FormData,
): Promise<VerificationResult> {
  const applicant = await prisma.applicant.findUnique({ where: { id: applicantId } });
  if (!applicant) return { ok: false, error: "Applicant not found" };
  if (applicant.volunteerId !== volunteerId) return { ok: false, error: "Not assigned to you" };
  if (!VERIFIABLE_STATUSES.includes(applicant.status)) {
    return { ok: false, error: "This applicant has already moved past the verification stage" };
  }

  const parsed = verificationSchema.safeParse({
    incomeBandVerified: formData.get("incomeBandVerified"),
    housingCondition: formData.get("housingCondition"),
    householdSizeConfirmed: formData.get("householdSizeConfirmed"),
    photoEvidenceConfirmed: formData.get("photoEvidenceConfirmed"),
    duplicateCheckPassed: formData.get("duplicateCheckPassed"),
    decision: formData.get("decision"),
    notes: formData.get("notes") || undefined,
    idempotencyKey: formData.get("idempotencyKey") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  if (data.decision === "REJECTED" && (!data.notes || data.notes.trim().length < 3)) {
    return { ok: false, error: "Add a rejection reason in the notes" };
  }
  const idempotencyKey = data.idempotencyKey ?? randomUUID();
  const priorReport = await prisma.physicalVerificationReport.findUnique({ where: { idempotencyKey }, select: { id: true } });
  if (priorReport) return { ok: true };

  const nextStatus =
    data.decision === "APPROVED" ? "VERIFIED" : data.decision === "REJECTED" ? "REJECTED" : "UNDER_VERIFICATION";

  await prisma.$transaction(async (tx) => {
    const report = await tx.physicalVerificationReport.create({
      data: {
        applicantId,
        volunteerId,
        visitAt: new Date(),
        incomeVerified: data.incomeBandVerified,
        housingCondition: data.housingCondition,
        confirmedHouseholdSize: data.householdSizeConfirmed,
        photoEvidenceCollected: data.photoEvidenceConfirmed,
        duplicateCheckPassed: data.duplicateCheckPassed,
        decision: data.decision,
        observations: data.notes ?? null,
        idempotencyKey,
      },
    });
    await tx.verification.upsert({
      where: { applicantId },
      create: { applicantId, volunteerId, visitDate: new Date(), ...data },
      update: { visitDate: new Date(), ...data },
    });
    await tx.applicant.update({ where: { id: applicantId }, data: { status: nextStatus } });
    const reportEvent = await appendEvent(tx, {
      aggregateType: "Applicant",
      aggregateId: applicantId,
      type: "PHYSICAL_VERIFICATION_SUBMITTED",
      payload: { reportId: report.id, decision: data.decision, actorId: volunteerId },
      idempotencyKey: `pv:${idempotencyKey}`,
    });
    if (data.decision === "REJECTED") {
      await appendEvent(tx, {
        aggregateType: "Applicant", aggregateId: applicantId, type: "APPLICANT_REJECTED",
        payload: { stage: "PHYSICAL_VERIFICATION", reason: data.notes, actorId: volunteerId },
        idempotencyKey: `applicant-rejected:physical:${idempotencyKey}`,
      });
      await notifyApplicant(tx, applicantId, reportEvent.id, "Application update", `Your application was not selected after physical verification. Reason: ${data.notes}`);
    } else if (data.decision === "APPROVED") {
      await notifyApplicant(tx, applicantId, reportEvent.id, "Physical verification complete", "Your physical verification is complete. The next step is an online panel interview.");
    }
    const activityAssignment = await tx.activityAssignment.findFirst({
      where: { volunteerId, activity: { type: "PHYSICAL_VERIFICATION", applicantId } },
      select: { id: true, activityId: true },
    });
    if (activityAssignment) {
      const activityReport = await tx.activityReport.create({
        data: {
          activityId: activityAssignment.activityId,
          assignmentId: activityAssignment.id,
          volunteerId,
          payload: { physicalVerificationReportId: report.id, decision: data.decision, notes: data.notes ?? null },
          idempotencyKey: `legacy-pv:${idempotencyKey}`,
        },
      });
      await tx.activityAssignment.update({ where: { id: activityAssignment.id }, data: { status: "SUBMITTED", completedAt: new Date() } });
      await tx.volunteerActivity.update({ where: { id: activityAssignment.activityId }, data: { status: "SUBMITTED" } });
      await appendEvent(tx, {
        aggregateType: "VolunteerActivity",
        aggregateId: activityAssignment.activityId,
        type: "PHYSICAL_VERIFICATION_SUBMITTED",
        payload: { reportId: activityReport.id, physicalVerificationReportId: report.id, volunteerId },
        idempotencyKey: `legacy-pv-activity:${idempotencyKey}`,
      });
    }
    if (isRealStatusChange(applicant.status, nextStatus)) {
      await appendEvent(tx, {
        aggregateType: "Applicant",
        aggregateId: applicantId,
        type: "APPLICANT_STATUS_CHANGED",
        payload: { fromStatus: applicant.status, toStatus: nextStatus, actorId: volunteerId, action: "VERIFICATION_SUBMITTED", decision: data.decision },
      });
    }
  });

  return { ok: true };
}
