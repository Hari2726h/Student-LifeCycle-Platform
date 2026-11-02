import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appendEvent, isRealStatusChange } from "@/lib/events";

export const verificationSchema = z.object({
  incomeBandVerified: z.coerce.boolean(),
  housingCondition: z.enum(["KUTCHA", "SEMI_PUCCA", "PUCCA"]),
  householdSizeConfirmed: z.coerce.number().int().min(1).max(30),
  photoEvidenceConfirmed: z.coerce.boolean(),
  duplicateCheckPassed: z.coerce.boolean(),
  decision: z.enum(["APPROVED", "REJECTED", "NEEDS_FOLLOW_UP"]),
  notes: z.string().optional(),
});

export type VerificationResult = { ok: true } | { ok: false; error: string };

/** The write path shared by the online form (a server action, same
 * request/response cycle) and the offline-queued submission (a plain API
 * route a service worker can retry later) — same validation, same
 * ownership check, same event-append rule, so a verification saved while
 * offline and synced minutes later is indistinguishable from one typed in
 * with a live connection. */
export async function submitVerificationCore(
  applicantId: string,
  volunteerId: string,
  formData: FormData,
): Promise<VerificationResult> {
  const applicant = await prisma.applicant.findUnique({ where: { id: applicantId } });
  if (!applicant) return { ok: false, error: "Applicant not found" };
  if (applicant.volunteerId !== volunteerId) return { ok: false, error: "Not assigned to you" };

  const parsed = verificationSchema.safeParse({
    incomeBandVerified: formData.get("incomeBandVerified"),
    housingCondition: formData.get("housingCondition"),
    householdSizeConfirmed: formData.get("householdSizeConfirmed"),
    photoEvidenceConfirmed: formData.get("photoEvidenceConfirmed"),
    duplicateCheckPassed: formData.get("duplicateCheckPassed"),
    decision: formData.get("decision"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const nextStatus =
    data.decision === "APPROVED" ? "VERIFIED" : data.decision === "REJECTED" ? "REJECTED" : "UNDER_VERIFICATION";

  await prisma.$transaction(async (tx) => {
    await tx.verification.upsert({
      where: { applicantId },
      create: { applicantId, volunteerId, visitDate: new Date(), ...data },
      update: { visitDate: new Date(), ...data },
    });
    await tx.applicant.update({ where: { id: applicantId }, data: { status: nextStatus } });
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
