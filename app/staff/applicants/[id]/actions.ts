"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

async function requireRole(roles: string[]) {
  const session = await auth();
  if (!session?.user || !roles.includes(session.user.role)) {
    redirect("/login");
  }
  return session.user;
}

const verificationSchema = z.object({
  incomeBandVerified: z.coerce.boolean(),
  housingCondition: z.enum(["KUTCHA", "SEMI_PUCCA", "PUCCA"]),
  householdSizeConfirmed: z.coerce.number().int().min(1).max(30),
  photoEvidenceConfirmed: z.coerce.boolean(),
  duplicateCheckPassed: z.coerce.boolean(),
  decision: z.enum(["APPROVED", "REJECTED", "NEEDS_FOLLOW_UP"]),
  notes: z.string().optional(),
});

export async function submitVerification(applicantId: string, formData: FormData) {
  const user = await requireRole(["VOLUNTEER"]);

  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
  if (applicant.volunteerId !== user.id) {
    redirect(`/staff/applicants/${applicantId}?error=Not+assigned+to+you`);
  }

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
    redirect(`/staff/applicants/${applicantId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const data = parsed.data;

  await prisma.verification.upsert({
    where: { applicantId },
    create: { applicantId, volunteerId: user.id, visitDate: new Date(), ...data },
    update: { visitDate: new Date(), ...data },
  });

  const nextStatus =
    data.decision === "APPROVED" ? "VERIFIED" : data.decision === "REJECTED" ? "REJECTED" : "UNDER_VERIFICATION";
  await prisma.applicant.update({ where: { id: applicantId }, data: { status: nextStatus } });

  redirect(`/staff/applicants/${applicantId}`);
}

/** Books the applicant into a committee member's declared slot (panel
 * availability) rather than a freely-typed date/time — a slot can hold
 * `capacity` applicants before it's full. */
export async function scheduleInterview(applicantId: string, formData: FormData) {
  await requireRole(["COMMITTEE"]);

  const slotId = formData.get("slotId");
  if (typeof slotId !== "string" || !slotId) {
    redirect(`/staff/applicants/${applicantId}?error=Select+an+available+slot`);
  }

  const slot = await prisma.interviewSlot.findUnique({
    where: { id: slotId },
    include: { _count: { select: { interviews: true } } },
  });
  if (!slot) {
    redirect(`/staff/applicants/${applicantId}?error=That+slot+no+longer+exists`);
  }
  if (slot._count.interviews >= slot.capacity) {
    redirect(`/staff/applicants/${applicantId}?error=That+slot+is+already+full`);
  }

  await prisma.interviewRecord.upsert({
    where: { applicantId },
    create: { applicantId, slotId: slot.id, scheduledAt: slot.scheduledAt, location: slot.location },
    update: { slotId: slot.id, scheduledAt: slot.scheduledAt, location: slot.location },
  });
  await prisma.applicant.update({ where: { id: applicantId }, data: { status: "INTERVIEW_SCHEDULED" } });

  redirect(`/staff/applicants/${applicantId}`);
}

const scoreSchema = z.object({
  academicMerit: z.coerce.number().int().min(1).max(10),
  financialNeed: z.coerce.number().int().min(1).max(10),
  communication: z.coerce.number().int().min(1).max(10),
  intentClarity: z.coerce.number().int().min(1).max(10),
  notes: z.string().optional(),
});

export async function submitScore(applicantId: string, formData: FormData) {
  const user = await requireRole(["COMMITTEE"]);

  const interview = await prisma.interviewRecord.findUniqueOrThrow({ where: { applicantId } });
  if (interview.decision !== "PENDING") {
    redirect(`/staff/applicants/${applicantId}?error=Decision+already+recorded`);
  }

  const parsed = scoreSchema.safeParse({
    academicMerit: formData.get("academicMerit"),
    financialNeed: formData.get("financialNeed"),
    communication: formData.get("communication"),
    intentClarity: formData.get("intentClarity"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    redirect(`/staff/applicants/${applicantId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  await prisma.interviewScore.upsert({
    where: { interviewId_panelistId: { interviewId: interview.id, panelistId: user.id } },
    create: { interviewId: interview.id, panelistId: user.id, ...parsed.data },
    update: { ...parsed.data },
  });

  await prisma.applicant.update({ where: { id: applicantId }, data: { status: "INTERVIEWED" } });

  redirect(`/staff/applicants/${applicantId}`);
}

export async function recordDecision(applicantId: string, formData: FormData) {
  const user = await requireRole(["COMMITTEE"]);

  const decision = formData.get("decision");
  if (decision !== "ACCEPTED" && decision !== "REJECTED" && decision !== "WAITLISTED") {
    redirect(`/staff/applicants/${applicantId}?error=Invalid+decision`);
  }

  const interview = await prisma.interviewRecord.findUniqueOrThrow({
    where: { applicantId },
    include: { scores: true },
  });

  // Append-only: a decision, once recorded, is never overwritten by this action.
  if (interview.decision !== "PENDING") {
    redirect(`/staff/applicants/${applicantId}`);
  }
  if (interview.scores.length === 0) {
    redirect(`/staff/applicants/${applicantId}?error=At+least+one+scorecard+is+required+first`);
  }

  await prisma.interviewRecord.update({
    where: { applicantId },
    data: { decision, decidedAt: new Date(), decidedById: user.id },
  });
  await prisma.applicant.update({ where: { id: applicantId }, data: { status: decision } });

  redirect(`/staff/applicants/${applicantId}`);
}
