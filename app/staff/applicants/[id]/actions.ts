"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { appendEvent, isRealStatusChange } from "@/lib/events";

async function requireRole(roles: string[]) {
  const session = await auth();
  if (!session?.user || !roles.includes(session.user.role)) {
    redirect("/login");
  }
  return session.user;
}

// Once an applicant has a final outcome (or has already been onboarded),
// none of the interview-stage actions below should be able to move them
// backward — re-scheduling, re-scoring, or re-deciding an already-decided
// applicant would silently undo a committee decision or orphan a Student
// record that already points at them.
const FINAL_APPLICANT_STATUSES = ["ACCEPTED", "REJECTED", "WAITLISTED", "WITHDRAWN"];

/** Books the applicant into a committee member's declared slot (panel
 * availability) rather than a freely-typed date/time — a slot can hold
 * `capacity` applicants before it's full.
 *
 * The capacity check and the booking happen in the same transaction, with
 * a row lock on the slot — reading the count outside the transaction (the
 * original approach) let two committee members both see "4/5 booked" and
 * both book the 5th seat, overbooking the slot. `SELECT ... FOR UPDATE`
 * makes the second transaction wait for the first to commit, then see the
 * updated count. */
export async function scheduleInterview(applicantId: string, formData: FormData) {
  const user = await requireRole(["COMMITTEE"]);

  const slotId = formData.get("slotId");
  if (typeof slotId !== "string" || !slotId) {
    redirect(`/staff/applicants/${applicantId}?error=Select+an+available+slot`);
  }

  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId }, include: { student: true } });
  if (FINAL_APPLICANT_STATUSES.includes(applicant.status) || applicant.student) {
    redirect(`/staff/applicants/${applicantId}?error=This+applicant+already+has+a+final+outcome`);
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InterviewSlot" WHERE id = ${slotId} FOR UPDATE`;

    const slot = await tx.interviewSlot.findUnique({
      where: { id: slotId },
      include: { _count: { select: { interviews: true } } },
    });
    if (!slot) return { ok: false as const, error: "That slot no longer exists" };

    const existingInterview = await tx.interviewRecord.findUnique({ where: { applicantId } });
    // A genuine reschedule to a different slot is still worth logging even
    // if status doesn't change; a resubmission of the exact same slot (a
    // double-click race) is not, and doesn't count against capacity again.
    const isNewOccupant = !existingInterview || existingInterview.slotId !== slot.id;
    if (isNewOccupant && slot._count.interviews >= slot.capacity) {
      return { ok: false as const, error: "That slot is already full" };
    }

    await tx.interviewRecord.upsert({
      where: { applicantId },
      create: { applicantId, slotId: slot.id, scheduledAt: slot.scheduledAt, location: slot.location },
      update: { slotId: slot.id, scheduledAt: slot.scheduledAt, location: slot.location },
    });
    await tx.applicant.update({ where: { id: applicantId }, data: { status: "INTERVIEW_SCHEDULED" } });
    if (isNewOccupant) {
      await appendEvent(tx, {
        aggregateType: "Applicant",
        aggregateId: applicantId,
        type: "APPLICANT_STATUS_CHANGED",
        payload: { fromStatus: applicant.status, toStatus: "INTERVIEW_SCHEDULED", actorId: user.id, action: "INTERVIEW_SCHEDULED", slotId: slot.id },
      });
    }
    return { ok: true as const };
  });

  if (!result.ok) {
    redirect(`/staff/applicants/${applicantId}?error=${encodeURIComponent(result.error)}`);
  }
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

  const interview = await prisma.interviewRecord.findUnique({ where: { applicantId } });
  if (!interview) {
    redirect(`/staff/applicants/${applicantId}?error=No+interview+scheduled+yet`);
  }
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

  await prisma.$transaction(async (tx) => {
    await tx.interviewScore.upsert({
      where: { interviewId_panelistId: { interviewId: interview.id, panelistId: user.id } },
      create: { interviewId: interview.id, panelistId: user.id, ...data },
      update: { ...data },
    });
    // Read inside the transaction, not before it, so the fromStatus this
    // records reflects what was actually true at write time — not a
    // snapshot that could already be stale if another panelist's
    // submission (or any other concurrent action) committed first.
    const applicant = await tx.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    await tx.applicant.update({ where: { id: applicantId }, data: { status: "INTERVIEWED" } });
    // Only the panelist whose score first moves the applicant into
    // INTERVIEWED causes a real transition — every other panelist scoring
    // the same interview (or anyone updating their own score) must not
    // append another identical "status changed" event.
    if (isRealStatusChange(applicant.status, "INTERVIEWED")) {
      await appendEvent(tx, {
        aggregateType: "Applicant",
        aggregateId: applicantId,
        type: "APPLICANT_STATUS_CHANGED",
        payload: { fromStatus: applicant.status, toStatus: "INTERVIEWED", actorId: user.id, action: "SCORE_SUBMITTED" },
      });
    }
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
  if (interview.scores.length === 0) {
    redirect(`/staff/applicants/${applicantId}?error=At+least+one+scorecard+is+required+first`);
  }

  // Append-only: a decision, once recorded, is never overwritten by this
  // action. The pre-check above is just a fast path for the UI — the real
  // guard is the conditional update inside the transaction below, which
  // only ever flips decision PENDING -> <decision> for exactly one caller.
  // Without that, two committee members deciding within the same instant
  // could both read "PENDING", both pass, and the second write would
  // silently overwrite the first's decision (last write wins) while also
  // appending a second, incorrectly-chained status-change event.
  const result = await prisma.$transaction(async (tx) => {
    const applicant = await tx.applicant.findUniqueOrThrow({ where: { id: applicantId } });

    const updated = await tx.interviewRecord.updateMany({
      where: { applicantId, decision: "PENDING" },
      data: { decision, decidedAt: new Date(), decidedById: user.id },
    });
    if (updated.count === 0) return { ok: false as const, alreadyDecided: true };

    await tx.applicant.update({ where: { id: applicantId }, data: { status: decision } });
    await appendEvent(tx, {
      aggregateType: "Applicant",
      aggregateId: applicantId,
      type: "APPLICANT_STATUS_CHANGED",
      payload: { fromStatus: applicant.status, toStatus: decision, actorId: user.id, action: "COMMITTEE_DECISION" },
    });
    return { ok: true as const };
  });

  if (!result.ok) {
    redirect(`/staff/applicants/${applicantId}`);
  }
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
