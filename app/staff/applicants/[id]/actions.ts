"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { appendEvent } from "@/lib/events";

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

  const nextStatus =
    data.decision === "APPROVED" ? "VERIFIED" : data.decision === "REJECTED" ? "REJECTED" : "UNDER_VERIFICATION";

  await prisma.$transaction(async (tx) => {
    await tx.verification.upsert({
      where: { applicantId },
      create: { applicantId, volunteerId: user.id, visitDate: new Date(), ...data },
      update: { visitDate: new Date(), ...data },
    });
    await tx.applicant.update({ where: { id: applicantId }, data: { status: nextStatus } });
    await appendEvent(tx, {
      aggregateType: "Applicant",
      aggregateId: applicantId,
      type: "APPLICANT_STATUS_CHANGED",
      payload: { fromStatus: applicant.status, toStatus: nextStatus, actorId: user.id, action: "VERIFICATION_SUBMITTED", decision: data.decision },
    });
  });

  redirect(`/staff/applicants/${applicantId}`);
}

/** Books the applicant into a committee member's declared slot (panel
 * availability) rather than a freely-typed date/time — a slot can hold
 * `capacity` applicants before it's full. */
export async function scheduleInterview(applicantId: string, formData: FormData) {
  const user = await requireRole(["COMMITTEE"]);

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

  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });

  await prisma.$transaction(async (tx) => {
    await tx.interviewRecord.upsert({
      where: { applicantId },
      create: { applicantId, slotId: slot.id, scheduledAt: slot.scheduledAt, location: slot.location },
      update: { slotId: slot.id, scheduledAt: slot.scheduledAt, location: slot.location },
    });
    await tx.applicant.update({ where: { id: applicantId }, data: { status: "INTERVIEW_SCHEDULED" } });
    await appendEvent(tx, {
      aggregateType: "Applicant",
      aggregateId: applicantId,
      type: "APPLICANT_STATUS_CHANGED",
      payload: { fromStatus: applicant.status, toStatus: "INTERVIEW_SCHEDULED", actorId: user.id, action: "INTERVIEW_SCHEDULED", slotId: slot.id },
    });
  });

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
  const data = parsed.data;
  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });

  await prisma.$transaction(async (tx) => {
    await tx.interviewScore.upsert({
      where: { interviewId_panelistId: { interviewId: interview.id, panelistId: user.id } },
      create: { interviewId: interview.id, panelistId: user.id, ...data },
      update: { ...data },
    });
    await tx.applicant.update({ where: { id: applicantId }, data: { status: "INTERVIEWED" } });
    await appendEvent(tx, {
      aggregateType: "Applicant",
      aggregateId: applicantId,
      type: "APPLICANT_STATUS_CHANGED",
      payload: { fromStatus: applicant.status, toStatus: "INTERVIEWED", actorId: user.id, action: "SCORE_SUBMITTED" },
    });
  });

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

  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });

  await prisma.$transaction(async (tx) => {
    await tx.interviewRecord.update({
      where: { applicantId },
      data: { decision, decidedAt: new Date(), decidedById: user.id },
    });
    await tx.applicant.update({ where: { id: applicantId }, data: { status: decision } });
    await appendEvent(tx, {
      aggregateType: "Applicant",
      aggregateId: applicantId,
      type: "APPLICANT_STATUS_CHANGED",
      payload: { fromStatus: applicant.status, toStatus: decision, actorId: user.id, action: "COMMITTEE_DECISION" },
    });
  });

  redirect(`/staff/applicants/${applicantId}`);
}

const onboardSchema = z.object({
  collegeId: z.string().min(1),
  program: z.string().min(2),
  admissionYear: z.coerce.number().int().min(2000).max(2100),
  mentorId: z.string().min(1),
  tuitionCovered: z.coerce.boolean(),
  hostelCovered: z.coerce.boolean(),
  foodCovered: z.coerce.boolean(),
  transportCovered: z.coerce.boolean(),
  materialsCovered: z.coerce.boolean(),
});

/** Converts an ACCEPTED applicant into the long-lived Student record:
 * college/program mapping, a sponsorship coverage checklist, and a mentor
 * — picked by staff from the ranked suggestion list, never auto-assigned. */
export async function onboardStudent(applicantId: string, formData: FormData) {
  const staffUser = await requireRole(["STAFF"]);

  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
  if (applicant.status !== "ACCEPTED") {
    redirect(`/staff/applicants/${applicantId}?error=Only+accepted+applicants+can+be+onboarded`);
  }
  const existing = await prisma.student.findUnique({ where: { applicantId } });
  if (existing) redirect(`/staff/applicants/${applicantId}`);

  const parsed = onboardSchema.safeParse({
    collegeId: formData.get("collegeId"),
    program: formData.get("program"),
    admissionYear: formData.get("admissionYear"),
    mentorId: formData.get("mentorId"),
    tuitionCovered: formData.get("tuitionCovered"),
    hostelCovered: formData.get("hostelCovered"),
    foodCovered: formData.get("foodCovered"),
    transportCovered: formData.get("transportCovered"),
    materialsCovered: formData.get("materialsCovered"),
  });
  if (!parsed.success) {
    redirect(`/staff/applicants/${applicantId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const data = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: applicant.userId }, data: { role: "STUDENT" } });
    const student = await tx.student.create({
      data: {
        userId: applicant.userId,
        applicantId: applicant.id,
        collegeId: data.collegeId,
        program: data.program,
        admissionYear: data.admissionYear,
        mentorId: data.mentorId,
        sponsorship: {
          create: {
            tuitionCovered: data.tuitionCovered,
            hostelCovered: data.hostelCovered,
            foodCovered: data.foodCovered,
            transportCovered: data.transportCovered,
            materialsCovered: data.materialsCovered,
          },
        },
      },
    });
    await appendEvent(tx, {
      aggregateType: "Student",
      aggregateId: student.id,
      type: "STUDENT_ONBOARDED",
      payload: { applicantId, mentorId: data.mentorId, collegeId: data.collegeId, actorId: staffUser.id },
    });
  });

  redirect(`/staff/applicants/${applicantId}`);
}
