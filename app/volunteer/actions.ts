"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/events";
import { notifyApplicant } from "@/lib/notifications";
import { describeUploadError, putActivityMediaDirect, putObjectDirect } from "@/lib/storage";

async function requireVolunteer() {
  const session = await auth();
  if (!session?.user || session.user.role !== "VOLUNTEER") redirect("/login");
  return session.user;
}

async function requireStaff() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");
  return session.user;
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/).or(z.literal("")),
  address: z.string().trim().max(500),
  skills: z.string().max(500),
  interests: z.string().max(500),
  availability: z.string().trim().max(500),
  profilePhotoUrl: z.string().url().refine((value) => value.startsWith("https://") || value.startsWith("http://")).or(z.literal("")),
});

export async function updateVolunteerProfile(formData: FormData) {
  const user = await requireVolunteer();
  const parsed = profileSchema.safeParse({
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    address: text(formData, "address"),
    skills: text(formData, "skills"),
    interests: text(formData, "interests"),
    availability: text(formData, "availability"),
    profilePhotoUrl: text(formData, "profilePhotoUrl"),
  });
  if (!parsed.success) redirect("/volunteer/profile?error=Check+the+profile+fields");
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { name: data.name, phone: data.phone || null },
      });
      await tx.volunteerProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          address: data.address || null,
          skills: data.skills.split(",").map((item) => item.trim()).filter(Boolean),
          interests: data.interests.split(",").map((item) => item.trim()).filter(Boolean),
          availability: data.availability || null,
          profilePhotoUrl: data.profilePhotoUrl || null,
        },
        update: {
          address: data.address || null,
          skills: data.skills.split(",").map((item) => item.trim()).filter(Boolean),
          interests: data.interests.split(",").map((item) => item.trim()).filter(Boolean),
          availability: data.availability || null,
          profilePhotoUrl: data.profilePhotoUrl || null,
        },
      });
    });
  } catch {
    redirect("/volunteer/profile?error=That+mobile+number+may+already+be+in+use");
  }
  revalidatePath("/volunteer");
  revalidatePath("/volunteer/profile");
  redirect("/volunteer/profile?saved=1");
}

const activitySchema = z.object({
  type: z.enum(["PHYSICAL_VERIFICATION", "CALL_VERIFICATION", "TUTORING", "SCHOOL_VISIT", "SANTA_PROGRAMME", "OTHER"]),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(3).max(3000),
  subject: z.string().trim().max(160),
  learningLevel: z.string().trim().max(120),
  location: z.string().trim().max(300),
  startsAt: z.coerce.date(),
  reportingAt: z.union([z.coerce.date(), z.literal("")]).optional(),
  dueAt: z.union([z.coerce.date(), z.literal("")]).optional(),
  schoolName: z.string().trim().max(160),
  schoolAddress: z.string().trim().max(300),
  schoolDistrict: z.string().trim().max(120),
  schoolContactPerson: z.string().trim().max(120),
  schoolContactNumber: z.string().trim().max(30),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  applicantId: z.string(),
  studentId: z.string(),
  idempotencyKey: z.string().uuid(),
});

export async function createVolunteerActivity(formData: FormData) {
  const staff = await requireStaff();
  const parsed = activitySchema.safeParse({
    type: text(formData, "type"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    subject: text(formData, "subject"),
    learningLevel: text(formData, "learningLevel"),
    location: text(formData, "location"),
    startsAt: text(formData, "startsAt"),
    reportingAt: text(formData, "reportingAt") || "",
    dueAt: text(formData, "dueAt") || "",
    schoolName: text(formData, "schoolName"),
    schoolAddress: text(formData, "schoolAddress"),
    schoolDistrict: text(formData, "schoolDistrict"),
    schoolContactPerson: text(formData, "schoolContactPerson"),
    schoolContactNumber: text(formData, "schoolContactNumber"),
    priority: text(formData, "priority") || "NORMAL",
    applicantId: text(formData, "applicantId"),
    studentId: text(formData, "studentId"),
    idempotencyKey: text(formData, "idempotencyKey"),
  });
  if (!parsed.success) redirect(`/staff/volunteers?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid activity")}`);
  const data = parsed.data;
  const volunteerIds = [...new Set(formData.getAll("volunteerIds").filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (volunteerIds.length === 0) redirect("/staff/volunteers?error=Assign+at+least+one+volunteer");
  if (["PHYSICAL_VERIFICATION", "CALL_VERIFICATION"].includes(data.type) && !data.applicantId) {
    redirect("/staff/volunteers?error=Choose+an+applicant+for+verification+activities");
  }
  if (data.type === "TUTORING" && !data.studentId) redirect("/staff/volunteers?error=Choose+a+student+for+tutoring+activities");
  if (data.type === "SCHOOL_VISIT" && (!data.schoolName || !data.schoolAddress)) {
    redirect("/staff/volunteers?error=Enter+the+school+name+and+address+for+this+visit");
  }
  if (data.type === "SANTA_PROGRAMME" && !data.reportingAt) {
    redirect("/staff/volunteers?error=Enter+the+Santa+programme+volunteer+reporting+time");
  }
  const [linkedApplicant, linkedStudent] = await Promise.all([
    data.applicantId ? prisma.applicant.findUnique({ where: { id: data.applicantId }, select: { id: true, status: true, callVerifications: { where: { status: "VERIFICATION_COMPLETED" }, take: 1, select: { id: true } } } }) : null,
    data.studentId ? prisma.student.findUnique({ where: { id: data.studentId }, select: { id: true } }) : null,
  ]);
  if (data.applicantId && !linkedApplicant) redirect("/staff/volunteers?error=Applicant+not+found");
  if (data.type === "CALL_VERIFICATION" && linkedApplicant && !["SUBMITTED", "UNDER_VERIFICATION"].includes(linkedApplicant.status)) {
    redirect("/staff/volunteers?error=Call+verification+can+only+be+scheduled+before+physical+verification");
  }
  if (data.type === "PHYSICAL_VERIFICATION" && linkedApplicant && linkedApplicant.callVerifications.length === 0) {
    redirect("/staff/volunteers?error=Complete+call+verification+before+scheduling+the+home+visit");
  }
  if (data.studentId && !linkedStudent) redirect("/staff/volunteers?error=Student+not+found");

  const volunteers = await prisma.user.findMany({
    where: { id: { in: volunteerIds }, role: "VOLUNTEER", isActive: true },
    select: { id: true },
  });
  if (volunteers.length !== volunteerIds.length) redirect("/staff/volunteers?error=One+or+more+volunteer+accounts+are+unavailable");
  const availableAssignmentRoles = ["Gift packing", "Decoration", "Event coordination", "Gift distribution", "Child engagement", "Photography", "School outreach", "Awareness session", "Higher education guidance", "Other event support"];
  for (const volunteer of volunteers) {
    const role = text(formData, `assignmentRole_${volunteer.id}`);
    const responsibility = text(formData, `assignmentResponsibility_${volunteer.id}`);
    if ((role && !availableAssignmentRoles.includes(role)) || responsibility.length > 300) redirect("/staff/volunteers?error=Check+the+volunteer+role+and+responsibility");
  }
  const existing = await prisma.volunteerActivity.findUnique({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true } });
  if (existing) redirect("/staff/volunteers?created=1");

  const activity = await prisma.$transaction(async (tx) => {
    const created = await tx.volunteerActivity.create({
      data: {
        type: data.type,
        name: data.name,
        description: data.description,
        subject: data.type === "TUTORING" ? data.subject || null : null,
        learningLevel: data.type === "TUTORING" ? data.learningLevel || null : null,
        location: data.location || null,
        startsAt: data.startsAt,
        reportingAt: data.type === "SANTA_PROGRAMME" && data.reportingAt instanceof Date ? data.reportingAt : null,
        dueAt: data.dueAt instanceof Date ? data.dueAt : null,
        schoolName: data.type === "SCHOOL_VISIT" ? data.schoolName || data.name : null,
        schoolAddress: data.type === "SCHOOL_VISIT" ? data.schoolAddress || data.location || null : null,
        schoolDistrict: data.type === "SCHOOL_VISIT" ? data.schoolDistrict || null : null,
        schoolContactPerson: data.type === "SCHOOL_VISIT" ? data.schoolContactPerson || null : null,
        schoolContactNumber: data.type === "SCHOOL_VISIT" ? data.schoolContactNumber || null : null,
        priority: data.priority,
        applicantId: data.applicantId || null,
        studentId: data.studentId || null,
        createdById: staff.id,
        idempotencyKey: data.idempotencyKey,
        assignments: {
          create: volunteers.map((volunteer) => ({
            volunteerId: volunteer.id,
            responsibility: [
              text(formData, `assignmentRole_${volunteer.id}`),
              text(formData, `assignmentResponsibility_${volunteer.id}`).slice(0, 300),
            ].filter(Boolean).join(" — ") || text(formData, "responsibility") || null,
          })),
        },
      },
      include: { assignments: true },
    });
    const activityEvent = await appendEvent(tx, {
      aggregateType: "VolunteerActivity",
      aggregateId: created.id,
      type: "ACTIVITY_CREATED",
      payload: { type: created.type, name: created.name, actorId: staff.id, assignedVolunteerIds: volunteers.map((v) => v.id) },
      idempotencyKey: `activity-created:${data.idempotencyKey}`,
    });
    if (created.applicantId && ["CALL_VERIFICATION", "PHYSICAL_VERIFICATION"].includes(created.type)) {
      const call = created.type === "CALL_VERIFICATION";
      await notifyApplicant(
        tx,
        created.applicantId,
        activityEvent.id,
        call ? "Call verification scheduled" : "Physical verification scheduled",
        `${call ? "A verification call" : "A home visit"} is scheduled for ${created.startsAt.toLocaleString()}${created.location ? ` at ${created.location}` : ""}.`,
      );
    }
    for (const assignment of created.assignments) {
      await appendEvent(tx, {
        aggregateType: "VolunteerActivity",
        aggregateId: created.id,
        type: "VOLUNTEER_ASSIGNED",
        payload: { assignmentId: assignment.id, volunteerId: assignment.volunteerId, actorId: staff.id },
        idempotencyKey: `volunteer-assigned:${assignment.id}`,
      });
    }
    return created;
  });
  revalidatePath("/staff/volunteers");
  revalidatePath("/volunteer");
  redirect(`/staff/volunteers?created=${activity.id}`);
}

export async function startVolunteerActivity(formData: FormData) {
  const user = await requireVolunteer();
  const assignmentId = text(formData, "assignmentId");
  const assignment = await prisma.activityAssignment.findFirst({
    where: { id: assignmentId, volunteerId: user.id },
    include: { activity: true },
  });
  if (!assignment || ["CANCELLED", "COMPLETED"].includes(assignment.status)) redirect("/volunteer/activities?error=Activity+is+not+available");
  if (assignment.status === "ASSIGNED" || assignment.status === "PLANNED") {
    await prisma.$transaction(async (tx) => {
      await tx.activityAssignment.update({ where: { id: assignment.id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
      await tx.volunteerActivity.update({ where: { id: assignment.activityId }, data: { status: "IN_PROGRESS" } });
      await appendEvent(tx, {
        aggregateType: "VolunteerActivity",
        aggregateId: assignment.activityId,
        type: "ACTIVITY_STARTED",
        payload: { assignmentId, volunteerId: user.id },
        idempotencyKey: `activity-started:${assignmentId}`,
      });
    });
  }
  revalidatePath("/volunteer");
  revalidatePath("/volunteer/activities");
}

const reportSchema = z.object({
  assignmentId: z.string().min(1),
  idempotencyKey: z.string().uuid(),
  hours: z.coerce.number().min(0).max(24),
});

export async function submitActivityReport(formData: FormData) {
  const user = await requireVolunteer();
  const parsed = reportSchema.safeParse({
    assignmentId: text(formData, "assignmentId"),
    idempotencyKey: text(formData, "idempotencyKey"),
    hours: text(formData, "hours") || "0",
  });
  if (!parsed.success) redirect("/volunteer/activities?error=Check+the+report+fields");
  const { assignmentId, idempotencyKey, hours } = parsed.data;
  const assignment = await prisma.activityAssignment.findFirst({
    where: { id: assignmentId, volunteerId: user.id },
    include: { activity: true },
  });
  if (!assignment || ["CANCELLED", "COMPLETED"].includes(assignment.status)) redirect("/volunteer/activities?error=Activity+is+not+available");
  const duplicate = await prisma.activityReport.findUnique({ where: { idempotencyKey }, select: { id: true } });
  if (duplicate) redirect(`/volunteer/activities/${assignment.activityId}?submitted=1`);

  const { type } = assignment.activity;
  let payload: Record<string, string | number | boolean | null>;
  if (type === "SCHOOL_VISIT") {
    const parsedVisit = z.object({
      schoolName: z.string().trim().min(2).max(160),
      schoolAddress: z.string().trim().max(300),
      district: z.string().trim().max(120),
      schoolContactNumber: z.string().trim().max(30),
      visitDate: z.coerce.date(),
      schoolRepresentative: z.string().trim().max(120),
      studentsInteracted: z.coerce.number().int().min(0).max(10000),
      classesVisited: z.string().trim().max(300),
      interestedStudents: z.coerce.number().int().min(0).max(10000),
      potentialApplicants: z.coerce.number().int().min(0).max(10000),
      awarenessSession: z.boolean(),
      higherEducationGuidance: z.boolean(),
      maatramIntroduction: z.boolean(),
      followUpRequired: z.boolean(),
      comments: z.string().max(3000),
    }).safeParse({
      schoolName: text(formData, "schoolName"),
      schoolAddress: text(formData, "schoolAddress"),
      district: text(formData, "district"),
      schoolContactNumber: text(formData, "schoolContactNumber"),
      visitDate: text(formData, "visitDate"),
      schoolRepresentative: text(formData, "schoolRepresentative"),
      studentsInteracted: text(formData, "studentsInteracted") || "0",
      classesVisited: text(formData, "classesVisited"),
      interestedStudents: text(formData, "interestedStudents") || "0",
      potentialApplicants: text(formData, "potentialApplicants") || "0",
      awarenessSession: checked(formData, "awarenessSession"),
      higherEducationGuidance: checked(formData, "higherEducationGuidance"),
      maatramIntroduction: checked(formData, "maatramIntroduction"),
      followUpRequired: checked(formData, "followUpRequired"),
      comments: text(formData, "comments"),
    });
    if (!parsedVisit.success) redirect(`/volunteer/activities/${assignment.activityId}?error=Check+the+school+visit+report`);
    payload = { ...parsedVisit.data, visitDate: parsedVisit.data.visitDate.toISOString() };
  } else if (type === "SANTA_PROGRAMME") {
    const parsedEvent = z.object({
      assignedRole: z.string().trim().min(2).max(120),
      eventAttended: z.boolean(),
      attendanceCount: z.coerce.number().int().min(0).max(10000),
      activitiesConducted: z.string().trim().min(2).max(3000),
      giftsDistributed: z.coerce.number().int().min(0).max(10000),
      comments: z.string().max(3000),
    }).safeParse({
      assignedRole: text(formData, "assignedRole"),
      eventAttended: checked(formData, "eventAttended"),
      attendanceCount: text(formData, "attendanceCount") || "0",
      activitiesConducted: text(formData, "activitiesConducted"),
      giftsDistributed: text(formData, "giftsDistributed") || "0",
      comments: text(formData, "comments"),
    });
    if (!parsedEvent.success) redirect(`/volunteer/activities/${assignment.activityId}?error=Check+the+programme+report`);
    payload = parsedEvent.data;
  } else if (type === "TUTORING") {
    payload = { summary: text(formData, "summary"), comments: text(formData, "comments") };
  } else {
    const parsedOther = z.object({
      summary: z.string().trim().min(3).max(3000),
      outcome: z.string().trim().max(3000),
      comments: z.string().max(3000),
    }).safeParse({ summary: text(formData, "summary"), outcome: text(formData, "outcome"), comments: text(formData, "comments") });
    if (!parsedOther.success) redirect(`/volunteer/activities/${assignment.activityId}?error=Enter+a+short+summary+for+this+activity`);
    payload = parsedOther.data;
  }
  const evidenceFiles = formData.getAll("evidence").filter((item): item is File => item instanceof File && item.size > 0);
  if (evidenceFiles.length > 4) redirect(`/volunteer/activities/${assignment.activityId}?error=Upload+up+to+four+files`);

  const savedEvidence: Awaited<ReturnType<typeof putObjectDirect>>[] = [];
  for (const file of evidenceFiles) {
    try {
      savedEvidence.push(type === "SANTA_PROGRAMME"
        ? await putActivityMediaDirect(assignment.activityId, file)
        : await putObjectDirect(assignment.activityId, file));
    } catch (error) {
      redirect(`/volunteer/activities/${assignment.activityId}?error=${encodeURIComponent(describeUploadError(error))}`);
    }
  }

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.activityReport.create({
      data: {
        activityId: assignment.activityId,
        assignmentId,
        volunteerId: user.id,
        payload,
        hours,
        idempotencyKey,
        evidence: {
          create: savedEvidence.map((evidence) => ({ ...evidence, uploadedById: user.id })),
        },
      },
    });
    await tx.activityAssignment.update({ where: { id: assignmentId }, data: { status: "SUBMITTED", completedAt: new Date() } });
    await tx.volunteerActivity.update({ where: { id: assignment.activityId }, data: { status: "SUBMITTED" } });
    await appendEvent(tx, {
      aggregateType: "VolunteerActivity",
      aggregateId: assignment.activityId,
      type: `${type}_SUBMITTED`,
      payload: { reportId: created.id, assignmentId, volunteerId: user.id, hours },
      idempotencyKey: `activity-report:${idempotencyKey}`,
    });
    return created;
  });
  revalidatePath("/volunteer");
  revalidatePath("/volunteer/activities");
  revalidatePath("/staff/volunteers");
  redirect(`/volunteer/activities/${assignment.activityId}?submitted=${report.id}`);
}

const callSchema = z.object({
  applicantId: z.string().min(1),
  activityId: z.string(),
  idempotencyKey: z.string().uuid(),
  calledAt: z.coerce.date(),
  alternateMobile: z.string().max(30),
  status: z.enum(["CONNECTED", "NOT_REACHABLE", "SWITCHED_OFF", "CALL_LATER", "WRONG_NUMBER", "VERIFICATION_COMPLETED", "REJECTED"]),
  studentAvailability: z.string().max(200),
  personAnswered: z.string().max(120),
  nextFollowUpAt: z.union([z.coerce.date(), z.literal("")]).optional(),
  comments: z.string().max(3000),
});

export async function submitCallVerification(formData: FormData) {
  const user = await requireVolunteer();
  const parsed = callSchema.safeParse({
    applicantId: text(formData, "applicantId"),
    activityId: text(formData, "activityId"),
    idempotencyKey: text(formData, "idempotencyKey"),
    calledAt: text(formData, "calledAt"),
    alternateMobile: text(formData, "alternateMobile"),
    status: text(formData, "status"),
    studentAvailability: text(formData, "studentAvailability"),
    personAnswered: text(formData, "personAnswered"),
    nextFollowUpAt: text(formData, "nextFollowUpAt") || "",
    comments: text(formData, "comments"),
  });
  if (!parsed.success) redirect("/volunteer/call-verifications?error=Check+the+call+details");
  const data = parsed.data;
  if (data.status === "REJECTED" && data.comments.trim().length < 3) redirect("/volunteer/call-verifications?error=Add+a+rejection+reason+in+the+comments");
  const activity = data.activityId
    ? await prisma.activityAssignment.findFirst({
        where: { volunteerId: user.id, activityId: data.activityId, status: { notIn: ["SUBMITTED", "COMPLETED", "CANCELLED"] }, activity: { type: "CALL_VERIFICATION", applicantId: data.applicantId } },
        select: { id: true, activityId: true, status: true },
      })
    : null;
  const applicant = await prisma.applicant.findUnique({ where: { id: data.applicantId }, select: { id: true, volunteerId: true, status: true } });
  if (!applicant || (applicant.volunteerId !== user.id && !activity)) redirect("/volunteer/call-verifications?error=Application+is+not+assigned+to+you");
  if (!["SUBMITTED", "UNDER_VERIFICATION"].includes(applicant.status)) redirect("/volunteer/call-verifications?error=This+application+has+already+left+the+call+verification+stage");
  const prior = await prisma.callVerification.findUnique({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true } });
  if (prior) redirect("/volunteer/call-verifications?saved=1");
  let attemptNumber = 0;
  const call = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${applicant.id}))`;
    attemptNumber = (await tx.callVerification.count({ where: { applicantId: applicant.id } })) + 1;
    const created = await tx.callVerification.create({
      data: {
        applicantId: applicant.id,
        volunteerId: user.id,
        activityId: activity?.activityId ?? null,
        calledAt: data.calledAt,
        attemptNumber,
        alternateMobile: data.alternateMobile || null,
        status: data.status,
        identityConfirmed: checked(formData, "identityConfirmed"),
        addressConfirmed: checked(formData, "addressConfirmed"),
        familyConfirmed: checked(formData, "familyConfirmed"),
        incomeConfirmed: checked(formData, "incomeConfirmed"),
        educationConfirmed: checked(formData, "educationConfirmed"),
        admissionInterest: checked(formData, "admissionInterest"),
        studentAvailability: data.studentAvailability || null,
        personAnswered: data.personAnswered || null,
        followUpRequired: checked(formData, "followUpRequired"),
        nextFollowUpAt: data.nextFollowUpAt instanceof Date ? data.nextFollowUpAt : null,
        comments: data.comments || null,
        idempotencyKey: data.idempotencyKey,
      },
    });
    if (created.status === "REJECTED") {
      const changed = await tx.applicant.updateMany({ where: { id: applicant.id, status: { in: ["SUBMITTED", "UNDER_VERIFICATION"] } }, data: { status: "REJECTED" } });
      if (changed.count > 0) {
        const rejectionEvent = await appendEvent(tx, {
          aggregateType: "Applicant", aggregateId: applicant.id, type: "APPLICANT_REJECTED",
          payload: { stage: "CALL_VERIFICATION", reason: created.comments, actorId: user.id },
          idempotencyKey: `applicant-rejected:call:${data.idempotencyKey}`,
        });
        await appendEvent(tx, {
          aggregateType: "Applicant", aggregateId: applicant.id, type: "APPLICANT_STATUS_CHANGED",
          payload: { fromStatus: applicant.status, toStatus: "REJECTED", action: "CALL_VERIFICATION", reason: created.comments, actorId: user.id },
          idempotencyKey: `call-rejected-status:${data.idempotencyKey}`,
        });
        await notifyApplicant(tx, applicant.id, rejectionEvent.id, "Application update", `Your application was not selected after call verification. Reason: ${created.comments}`);
      }
    }
    if (activity) {
      if (["VERIFICATION_COMPLETED", "REJECTED"].includes(created.status)) {
        await tx.activityReport.create({
          data: {
            activityId: activity.activityId,
            assignmentId: activity.id,
            volunteerId: user.id,
            payload: { callVerificationId: created.id, applicantId: applicant.id, attemptNumber, status: created.status, followUpRequired: created.followUpRequired, comments: created.comments },
            hours: 0,
            idempotencyKey: `call:${data.idempotencyKey}`,
          },
        });
      }
      await tx.activityAssignment.update({
        where: { id: activity.id },
        data: ["VERIFICATION_COMPLETED", "REJECTED"].includes(created.status)
          ? { status: "SUBMITTED", completedAt: new Date() }
          : { status: "IN_PROGRESS", startedAt: new Date() },
      });
      await tx.volunteerActivity.update({ where: { id: activity.activityId }, data: { status: ["VERIFICATION_COMPLETED", "REJECTED"].includes(created.status) ? "SUBMITTED" : "IN_PROGRESS" } });
    }
    const callEvent = await appendEvent(tx, {
      aggregateType: "Applicant",
      aggregateId: applicant.id,
      type: "CALL_VERIFICATION_RECORDED",
      payload: { callVerificationId: created.id, volunteerId: user.id, attemptNumber, status: created.status },
      idempotencyKey: `call-verification:${data.idempotencyKey}`,
    });
    if (created.status === "VERIFICATION_COMPLETED") {
      await notifyApplicant(tx, applicant.id, callEvent.id, "Call verification complete", "Your call verification is complete. The team will contact you about the physical verification visit.");
    }
    if (activity) {
      await appendEvent(tx, {
        aggregateType: "VolunteerActivity",
        aggregateId: activity.activityId,
        type: created.status === "VERIFICATION_COMPLETED" ? "CALL_VERIFICATION_COMPLETED" : "CALL_VERIFICATION_ATTEMPTED",
        payload: { callVerificationId: created.id, assignmentId: activity.id, volunteerId: user.id, attemptNumber, status: created.status },
        idempotencyKey: `call-activity:${data.idempotencyKey}`,
      });
    }
    return created;
  });
  revalidatePath("/volunteer");
  revalidatePath("/volunteer/call-verifications");
  redirect(`/volunteer/call-verifications?saved=${call.id}`);
}

const physicalSchema = z.object({
  applicantId: z.string().min(1),
  activityId: z.string(),
  idempotencyKey: z.string().uuid(),
  visitAt: z.coerce.date(),
  personMet: z.string().max(120),
  relationshipToStudent: z.string().max(120),
  visitLocation: z.string().max(300),
  housingCondition: z.enum(["KUTCHA", "SEMI_PUCCA", "PUCCA"]).or(z.literal("")),
  confirmedHouseholdSize: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().min(1).max(30).optional()),
  earningMembers: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().min(0).max(30).optional()),
  dependents: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().min(0).max(30).optional()),
  financialCondition: z.string().max(1500),
  guardianOccupation: z.string().max(120),
  higherEducationInterest: z.string().max(500),
  pvReason: z.string().max(1500),
  familyCircumstances: z.string().max(1500),
  educationInterest: z.string().max(1500),
  observations: z.string().max(3000),
  recommendation: z.string().max(1500),
  decision: z.enum(["APPROVED", "REJECTED", "NEEDS_FOLLOW_UP"]),
});

export async function submitPhysicalVerification(formData: FormData) {
  const user = await requireVolunteer();
  const parsed = physicalSchema.safeParse({
    applicantId: text(formData, "applicantId"),
    activityId: text(formData, "activityId"),
    idempotencyKey: text(formData, "idempotencyKey"),
    visitAt: text(formData, "visitAt"),
    personMet: text(formData, "personMet"),
    relationshipToStudent: text(formData, "relationshipToStudent"),
    visitLocation: text(formData, "visitLocation"),
    housingCondition: text(formData, "housingCondition"),
    confirmedHouseholdSize: text(formData, "confirmedHouseholdSize") || "",
    earningMembers: text(formData, "earningMembers") || "",
    dependents: text(formData, "dependents") || "",
    financialCondition: text(formData, "financialCondition"),
    guardianOccupation: text(formData, "guardianOccupation"),
    higherEducationInterest: text(formData, "higherEducationInterest"),
    pvReason: text(formData, "pvReason"),
    familyCircumstances: text(formData, "familyCircumstances"),
    educationInterest: text(formData, "educationInterest"),
    observations: text(formData, "observations"),
    recommendation: text(formData, "recommendation"),
    decision: text(formData, "decision"),
  });
  if (!parsed.success) redirect(`/volunteer/physical-verifications?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the visit details")}`);
  const data = parsed.data;
  if (data.decision === "REJECTED" && data.observations.trim().length < 3) {
    redirect(`/volunteer/physical-verifications?error=Add+a+reason+in+the+observations+field+before+rejecting`);
  }
  const activityAssignment = data.activityId
    ? await prisma.activityAssignment.findFirst({
        where: { volunteerId: user.id, activityId: data.activityId, activity: { type: "PHYSICAL_VERIFICATION", applicantId: data.applicantId } },
        select: { id: true, activityId: true },
      })
    : null;
  const applicant = await prisma.applicant.findUnique({ where: { id: data.applicantId }, select: { id: true, volunteerId: true, status: true } });
  if (!applicant || (applicant.volunteerId !== user.id && !activityAssignment)) redirect("/volunteer/physical-verifications?error=Application+is+not+assigned+to+you");
  if (!["SUBMITTED", "UNDER_VERIFICATION"].includes(applicant.status)) redirect(`/volunteer/physical-verifications/${applicant.id}?error=This+application+has+already+left+the+verification+stage`);
  const previous = await prisma.physicalVerificationReport.findUnique({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true } });
  if (previous) redirect(`/volunteer/physical-verifications/${applicant.id}?saved=1`);

  const categories = [
    ["housePhotos", "HOUSE_PHOTO"],
    ["studentPhotos", "STUDENT_PHOTO"],
    ["incomeProof", "INCOME_PROOF"],
    ["addressProof", "ADDRESS_PROOF"],
    ["supportingDocuments", "SUPPORTING_DOCUMENT"],
  ] as const;
  const uploads: { kind: (typeof categories)[number][1]; saved: Awaited<ReturnType<typeof putObjectDirect>> }[] = [];
  let fileCount = 0;
  for (const [key, kind] of categories) {
    for (const item of formData.getAll(key)) {
      if (!(item instanceof File) || item.size === 0) continue;
      fileCount += 1;
      if (fileCount > 4) redirect(`/volunteer/physical-verifications/${applicant.id}?error=Upload+up+to+four+files`);
      try {
        uploads.push({ kind, saved: await putObjectDirect(applicant.id, item) });
      } catch (error) {
        redirect(`/volunteer/physical-verifications/${applicant.id}?error=${encodeURIComponent(describeUploadError(error))}`);
      }
    }
  }

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.physicalVerificationReport.create({
      data: {
        applicantId: applicant.id,
        volunteerId: user.id,
        visitAt: data.visitAt,
        personMet: data.personMet || null,
        relationshipToStudent: data.relationshipToStudent || null,
        visitLocation: data.visitLocation || null,
        identityVerified: checked(formData, "identityVerified"),
        addressVerified: checked(formData, "addressVerified"),
        incomeVerified: checked(formData, "incomeVerified"),
        housingVerified: checked(formData, "housingVerified"),
        householdConfirmed: checked(formData, "householdConfirmed"),
        photoEvidenceCollected: uploads.length > 0,
        duplicateCheckPassed: checked(formData, "duplicateCheckPassed"),
        housingCondition: data.housingCondition || null,
        confirmedHouseholdSize: data.confirmedHouseholdSize ?? null,
        earningMembers: data.earningMembers ?? null,
        dependents: data.dependents ?? null,
        financialCondition: data.financialCondition || null,
        guardianOccupation: data.guardianOccupation || null,
        higherEducationInterest: data.higherEducationInterest || null,
        pvReason: data.pvReason || null,
        familyCircumstances: data.familyCircumstances || null,
        educationInterest: data.educationInterest || null,
        observations: data.observations || null,
        recommendation: data.recommendation || null,
        decision: data.decision,
        idempotencyKey: data.idempotencyKey,
      },
    });
    await tx.verification.upsert({
      where: { applicantId: applicant.id },
      create: {
        applicantId: applicant.id,
        volunteerId: user.id,
        visitDate: data.visitAt,
        incomeBandVerified: checked(formData, "incomeVerified"),
        housingCondition: data.housingCondition || null,
        householdSizeConfirmed: data.confirmedHouseholdSize ?? null,
        photoEvidenceConfirmed: uploads.length > 0,
        duplicateCheckPassed: checked(formData, "duplicateCheckPassed"),
        decision: data.decision,
        notes: data.observations || null,
      },
      update: {
        visitDate: data.visitAt,
        incomeBandVerified: checked(formData, "incomeVerified"),
        housingCondition: data.housingCondition || null,
        householdSizeConfirmed: data.confirmedHouseholdSize ?? null,
        photoEvidenceConfirmed: uploads.length > 0,
        duplicateCheckPassed: checked(formData, "duplicateCheckPassed"),
        decision: data.decision,
        notes: data.observations || null,
      },
    });
    for (const item of uploads) {
      await tx.document.create({
        data: { ...item.saved, kind: item.kind, applicantId: applicant.id, uploadedById: user.id },
      });
    }
    const nextStatus = data.decision === "APPROVED" ? "VERIFIED" : data.decision === "REJECTED" ? "REJECTED" : "UNDER_VERIFICATION";
    await tx.applicant.update({ where: { id: applicant.id }, data: { status: nextStatus } });
    if (activityAssignment) {
      const activityPayload = {
        physicalVerificationReportId: created.id,
        decision: data.decision,
        volunteerId: user.id,
        evidenceCount: uploads.length,
        observations: data.observations,
      };
      const activityReport = await tx.activityReport.create({
        data: {
          activityId: activityAssignment.activityId,
          assignmentId: activityAssignment.id,
          volunteerId: user.id,
          payload: activityPayload,
          hours: 0,
          idempotencyKey: `physical:${data.idempotencyKey}`,
        },
      });
      await tx.activityAssignment.update({ where: { id: activityAssignment.id }, data: { status: "SUBMITTED", completedAt: new Date() } });
      await tx.volunteerActivity.update({ where: { id: activityAssignment.activityId }, data: { status: "SUBMITTED" } });
      await appendEvent(tx, {
        aggregateType: "VolunteerActivity",
        aggregateId: activityAssignment.activityId,
        type: "PHYSICAL_VERIFICATION_SUBMITTED",
        payload: { reportId: activityReport.id, physicalVerificationReportId: created.id, volunteerId: user.id },
        idempotencyKey: `pv-activity:${data.idempotencyKey}`,
      });
    }
    const reportEvent = await appendEvent(tx, {
      aggregateType: "Applicant",
      aggregateId: applicant.id,
      type: "PHYSICAL_VERIFICATION_SUBMITTED",
      payload: { reportId: created.id, decision: data.decision, actorId: user.id, evidenceCount: uploads.length },
      idempotencyKey: `pv:${data.idempotencyKey}`,
    });
    if (data.decision === "REJECTED") {
      await appendEvent(tx, {
        aggregateType: "Applicant", aggregateId: applicant.id, type: "APPLICANT_REJECTED",
        payload: { stage: "PHYSICAL_VERIFICATION", reason: data.observations, actorId: user.id },
        idempotencyKey: `applicant-rejected:physical:${data.idempotencyKey}`,
      });
      await notifyApplicant(tx, applicant.id, reportEvent.id, "Application update", `Your application was not selected after physical verification. Reason: ${data.observations}`);
    } else if (data.decision === "APPROVED") {
      await notifyApplicant(tx, applicant.id, reportEvent.id, "Physical verification complete", "Your physical verification is complete. The next step is an online panel interview.");
    }
    if (applicant.status !== nextStatus) {
      await appendEvent(tx, {
        aggregateType: "Applicant",
        aggregateId: applicant.id,
        type: "APPLICANT_STATUS_CHANGED",
        payload: { fromStatus: applicant.status, toStatus: nextStatus, actorId: user.id, action: "VERIFICATION_SUBMITTED", decision: data.decision },
        idempotencyKey: `pv-status:${data.idempotencyKey}`,
      });
    }
    return created;
  });
  revalidatePath("/volunteer");
  revalidatePath("/volunteer/physical-verifications");
  revalidatePath(`/staff/applicants/${applicant.id}`);
  revalidatePath("/staff/volunteers");
  redirect(`/volunteer/physical-verifications/${applicant.id}?saved=${report.id}`);
}

const tutoringSchema = z.object({
  assignmentId: z.string(),
  studentId: z.string(),
  studentName: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(120),
  topic: z.string().trim().min(2).max(300),
  sessionAt: z.coerce.date(),
  startTime: z.string().max(20),
  endTime: z.string().max(20),
  durationHours: z.coerce.number().min(0.25).max(12),
  mode: z.enum(["ONLINE", "OFFLINE"]),
  attendance: z.enum(["PRESENT", "ABSENT"]),
  understanding: z.string().max(1000),
  homework: z.string().max(1000),
  comments: z.string().max(3000),
  nextSessionAt: z.union([z.coerce.date(), z.literal("")]).optional(),
  assessmentMark: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().min(0).max(100).optional()),
  idempotencyKey: z.string().uuid(),
});

export async function submitTutoringSession(formData: FormData) {
  const user = await requireVolunteer();
  const parsed = tutoringSchema.safeParse({
    assignmentId: text(formData, "assignmentId"),
    studentId: text(formData, "studentId"),
    studentName: text(formData, "studentName"),
    subject: text(formData, "subject"),
    topic: text(formData, "topic"),
    sessionAt: text(formData, "sessionAt"),
    startTime: text(formData, "startTime"),
    endTime: text(formData, "endTime"),
    durationHours: text(formData, "durationHours") || "1",
    mode: text(formData, "mode"),
    attendance: text(formData, "attendance"),
    understanding: text(formData, "understanding"),
    homework: text(formData, "homework"),
    comments: text(formData, "comments"),
    nextSessionAt: text(formData, "nextSessionAt") || "",
    assessmentMark: text(formData, "assessmentMark") || "",
    idempotencyKey: text(formData, "idempotencyKey"),
  });
  if (!parsed.success) redirect(`/volunteer/tutoring?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the session fields")}`);
  const data = parsed.data;
  const assignment = data.assignmentId
    ? await prisma.activityAssignment.findFirst({
        where: { id: data.assignmentId, volunteerId: user.id, activity: { type: "TUTORING" } },
        include: {
          activity: {
            include: {
              student: { include: { user: { select: { name: true } } } },
            },
          },
        },
      })
    : null;
  if (!assignment) redirect("/volunteer/tutoring?error=Tutoring+assignment+is+not+assigned+to+you");
  const student = assignment.activity.student;
  if (!student || data.studentId !== student.id) redirect("/volunteer/tutoring?error=Student+is+not+linked+to+your+tutoring+activity");
  const duplicate = await prisma.tutoringSession.findUnique({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true } });
  if (duplicate) redirect("/volunteer/tutoring?saved=1");
  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.tutoringSession.create({
      data: {
        activityId: assignment?.activityId ?? null,
        assignmentId: assignment?.id ?? null,
        studentId: student?.id ?? null,
        volunteerId: user.id,
        studentName: student.user.name,
        subject: data.subject,
        topic: data.topic,
        sessionAt: data.sessionAt,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        durationHours: data.durationHours,
        mode: data.mode,
        attendance: data.attendance,
        understanding: data.understanding || null,
        homework: data.homework || null,
        comments: data.comments || null,
        nextSessionAt: data.nextSessionAt instanceof Date ? data.nextSessionAt : null,
        assessmentMark: data.assessmentMark ?? null,
        idempotencyKey: data.idempotencyKey,
      },
    });
    await appendEvent(tx, {
      aggregateType: "TutoringSession",
      aggregateId: created.id,
      type: "TUTORING_SESSION_COMPLETED",
      payload: { activityId: assignment?.activityId ?? null, studentId: student?.id ?? null, volunteerId: user.id, durationHours: data.durationHours, attendance: data.attendance },
      idempotencyKey: `tutoring:${data.idempotencyKey}`,
    });
    return created;
  });
  revalidatePath("/volunteer");
  revalidatePath("/volunteer/tutoring");
  revalidatePath("/volunteer/history");
  redirect(`/volunteer/tutoring?saved=${session.id}`);
}

const expenseLineSchema = z.object({
  idempotencyKey: z.string().uuid(),
  description: z.string().trim().min(2).max(300),
  category: z.enum(["Travel", "Food", "Accommodation", "Materials", "Other"]),
  expenseAt: z.coerce.date(),
  amount: z.coerce.number().positive().max(1000000),
});

export async function submitActivityExpense(formData: FormData) {
  const user = await requireVolunteer();
  const assignmentId = text(formData, "assignmentId");
  const itemKeys = formData.getAll("expenseItemKey").filter((key): key is string => typeof key === "string");
  if (!assignmentId || itemKeys.length < 1 || itemKeys.length > 4 || new Set(itemKeys).size !== itemKeys.length) {
    redirect("/volunteer/expenses?error=Add+between+1+and+4+valid+expense+items");
  }
  const parsedLines = itemKeys.map((idempotencyKey) => expenseLineSchema.safeParse({
    idempotencyKey,
    description: text(formData, `description_${idempotencyKey}`),
    category: text(formData, `category_${idempotencyKey}`),
    expenseAt: text(formData, `expenseAt_${idempotencyKey}`),
    amount: text(formData, `amount_${idempotencyKey}`),
  }));
  const invalidLine = parsedLines.find((line) => !line.success);
  if (invalidLine && !invalidLine.success) redirect(`/volunteer/expenses?error=${encodeURIComponent(invalidLine.error.issues[0]?.message ?? "Check the expense fields")}`);
  const lines = parsedLines.map((line) => line.success ? line.data : null);
  if (lines.some((line) => line === null)) redirect("/volunteer/expenses?error=Check+the+expense+fields");
  const validLines = lines.filter((line): line is NonNullable<typeof line> => line !== null);
  const assignment = await prisma.activityAssignment.findFirst({ where: { id: assignmentId, volunteerId: user.id } });
  if (!assignment) redirect("/volunteer/expenses?error=Activity+is+not+assigned+to+you");
  if (validLines.some((line) => !z.string().uuid().safeParse(line.idempotencyKey).success)) {
    redirect("/volunteer/expenses?error=Refresh+the+form+and+try+again");
  }
  const priorExpenses = await prisma.activityExpense.findMany({ where: { idempotencyKey: { in: validLines.map((line) => line.idempotencyKey) } }, select: { idempotencyKey: true } });
  if (priorExpenses.length === validLines.length) redirect("/volunteer/expenses?saved=1");
  if (priorExpenses.length > 0) redirect("/volunteer/expenses?error=Some+items+were+already+submitted.+Refresh+the+page+before+retrying");

  const uploads: { line: (typeof validLines)[number]; receipt: Awaited<ReturnType<typeof putObjectDirect>> }[] = [];
  for (const line of validLines) {
    const receipt = formData.get(`receipt_${line.idempotencyKey}`);
    if (!(receipt instanceof File) || receipt.size === 0) redirect("/volunteer/expenses?error=Attach+a+receipt+to+every+expense+item");
    try {
      uploads.push({ line, receipt: await putObjectDirect(assignment.activityId, receipt) });
    } catch (error) {
      redirect(`/volunteer/expenses?error=${encodeURIComponent(describeUploadError(error))}`);
    }
  }
  const expenses = await prisma.$transaction(async (tx) => {
    const createdExpenses = [];
    for (const { line, receipt } of uploads) {
      const created = await tx.activityExpense.create({
        data: {
          activityId: assignment.activityId,
          assignmentId: assignment.id,
          volunteerId: user.id,
          description: line.description,
          category: line.category,
          expenseAt: line.expenseAt,
          amount: line.amount,
          receiptKey: receipt.storageKey,
          receiptName: receipt.fileName,
          idempotencyKey: line.idempotencyKey,
        },
      });
      await appendEvent(tx, {
        aggregateType: "VolunteerActivity",
        aggregateId: assignment.activityId,
        type: "ACTIVITY_EXPENSE_SUBMITTED",
        payload: { expenseId: created.id, volunteerId: user.id, amount: line.amount, category: line.category },
        idempotencyKey: `expense:${line.idempotencyKey}`,
      });
      createdExpenses.push(created);
    }
    return createdExpenses;
  });
  revalidatePath("/volunteer/expenses");
  revalidatePath("/staff/volunteers");
  redirect(`/volunteer/expenses?saved=${expenses.length}`);
}

export async function reviewActivityReport(formData: FormData) {
  const staff = await requireStaff();
  const reportId = text(formData, "reportId");
  const decision = text(formData, "decision");
  const note = text(formData, "reviewNote").slice(0, 2000);
  if (!reportId || !["APPROVED", "FOLLOW_UP"].includes(decision)) redirect("/staff/volunteers?error=Invalid+report+review");
  const reviewDecision = decision as "APPROVED" | "FOLLOW_UP";
  const report = await prisma.activityReport.findUnique({ where: { id: reportId }, include: { activity: true, assignment: true } });
  if (!report) redirect("/staff/volunteers?error=Report+not+found");
  if (report.reviewStatus !== "PENDING") redirect("/staff/volunteers?error=Report+already+reviewed");
  await prisma.$transaction(async (tx) => {
    await tx.activityReport.update({ where: { id: report.id }, data: { reviewStatus: reviewDecision, reviewNote: note || null, reviewedById: staff.id, reviewedAt: new Date() } });
    const assignmentStatus = reviewDecision === "APPROVED" ? "COMPLETED" : "FOLLOW_UP";
    await tx.activityAssignment.update({ where: { id: report.assignmentId }, data: { status: assignmentStatus } });
    const pending = await tx.activityAssignment.count({ where: { activityId: report.activityId, status: { notIn: ["COMPLETED", "CANCELLED"] } } });
    await tx.volunteerActivity.update({ where: { id: report.activityId }, data: { status: pending === 0 && reviewDecision === "APPROVED" ? "COMPLETED" : reviewDecision === "FOLLOW_UP" ? "FOLLOW_UP" : "SUBMITTED" } });
    await appendEvent(tx, {
      aggregateType: "VolunteerActivity",
      aggregateId: report.activityId,
      type: reviewDecision === "APPROVED" ? "ACTIVITY_REPORT_APPROVED" : "ACTIVITY_FOLLOW_UP_REQUESTED",
      payload: { reportId, reviewedBy: staff.id, reviewNote: note },
      idempotencyKey: `report-review:${reportId}`,
    });
  });
  revalidatePath("/staff/volunteers");
  revalidatePath("/volunteer");
}

export async function reviewActivityExpense(formData: FormData) {
  const staff = await requireStaff();
  const expenseId = text(formData, "expenseId");
  const decision = text(formData, "decision");
  const note = text(formData, "reviewNote").slice(0, 2000);
  if (!expenseId || !["APPROVED", "REJECTED"].includes(decision)) redirect("/staff/volunteers?error=Invalid+expense+review");
  const expenseDecision = decision as "APPROVED" | "REJECTED";
  const expense = await prisma.activityExpense.findUnique({ where: { id: expenseId } });
  if (!expense) redirect("/staff/volunteers?error=Expense+not+found");
  if (expense.status !== "PENDING") redirect("/staff/volunteers?error=Expense+already+reviewed");
  await prisma.$transaction(async (tx) => {
    await tx.activityExpense.update({ where: { id: expenseId }, data: { status: expenseDecision, reviewedById: staff.id, reviewedAt: new Date(), reviewNote: note || null } });
    await appendEvent(tx, {
      aggregateType: "VolunteerActivity",
      aggregateId: expense.activityId,
      type: "ACTIVITY_EXPENSE_REVIEWED",
      payload: { expenseId, decision: expenseDecision, reviewedBy: staff.id, reviewNote: note },
      idempotencyKey: `expense-review:${expenseId}`,
    });
  });
  revalidatePath("/staff/volunteers");
  revalidatePath("/volunteer/expenses");
}

const schoolInterestSchema = z.object({
  activityId: z.string().min(1),
  studentName: z.string().trim().min(2).max(120),
  classOrYear: z.string().trim().min(1).max(80),
  contactNumber: z.string().trim().max(30),
  courseInterest: z.string().trim().max(160),
  higherEducationInterest: z.string().trim().max(500),
  notes: z.string().trim().max(1000),
  idempotencyKey: z.string().uuid(),
});

export async function recordSchoolVisitInterest(formData: FormData) {
  const user = await requireVolunteer();
  const parsed = schoolInterestSchema.safeParse({
    activityId: text(formData, "activityId"),
    studentName: text(formData, "studentName"),
    classOrYear: text(formData, "classOrYear"),
    contactNumber: text(formData, "contactNumber"),
    courseInterest: text(formData, "courseInterest"),
    higherEducationInterest: text(formData, "higherEducationInterest"),
    notes: text(formData, "notes"),
    idempotencyKey: text(formData, "idempotencyKey"),
  });
  if (!parsed.success) redirect("/volunteer/school-visits?error=Check+the+student+interest+fields");
  const data = parsed.data;
  const consent = checked(formData, "contactConsent");
  if (consent && !/^\+?[0-9\s()-]{7,20}$/.test(data.contactNumber)) redirect("/volunteer/school-visits?error=Enter+a+valid+number+only+when+contact+consent+is+given");
  const assignment = await prisma.activityAssignment.findFirst({
    where: { volunteerId: user.id, activityId: data.activityId, activity: { type: "SCHOOL_VISIT" } },
    select: { activityId: true },
  });
  if (!assignment) redirect("/volunteer/school-visits?error=School+visit+is+not+assigned+to+you");
  const duplicate = await prisma.schoolVisitInterest.findUnique({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true } });
  if (duplicate) redirect("/volunteer/school-visits?saved=1");
  const interest = await prisma.$transaction(async (tx) => {
    const created = await tx.schoolVisitInterest.create({
      data: {
        activityId: assignment.activityId,
        recordedById: user.id,
        studentName: data.studentName,
        classOrYear: data.classOrYear,
        contactNumber: consent ? data.contactNumber : null,
        contactConsent: consent,
        courseInterest: data.courseInterest || null,
        higherEducationInterest: data.higherEducationInterest || null,
        financialSupportNeeded: checked(formData, "financialSupportNeeded"),
        followUpRequired: checked(formData, "followUpRequired"),
        notes: data.notes || null,
        idempotencyKey: data.idempotencyKey,
      },
    });
    await appendEvent(tx, {
      aggregateType: "VolunteerActivity",
      aggregateId: assignment.activityId,
      type: "SCHOOL_VISIT_INTEREST_RECORDED",
      payload: { interestId: created.id, volunteerId: user.id, followUpRequired: created.followUpRequired, contactConsent: consent },
      idempotencyKey: `school-interest:${data.idempotencyKey}`,
    });
    return created;
  });
  revalidatePath("/volunteer/school-visits");
  revalidatePath("/staff/volunteers");
  redirect(`/volunteer/school-visits?saved=${interest.id}`);
}

export async function createSantaBeneficiary(formData: FormData) {
  const staff = await requireStaff();
  const activityId = text(formData, "activityId");
  const childName = text(formData, "childName").slice(0, 120);
  const age = Number(text(formData, "age"));
  const giftCategory = text(formData, "giftCategory").slice(0, 120);
  const idempotencyKey = text(formData, "idempotencyKey");
  if (!activityId || childName.length < 2 || !Number.isInteger(age) || age < 0 || age > 18 || !giftCategory || !z.string().uuid().safeParse(idempotencyKey).success) redirect("/staff/volunteers?error=Check+the+beneficiary+fields");
  const activity = await prisma.volunteerActivity.findFirst({ where: { id: activityId, type: "SANTA_PROGRAMME" }, select: { id: true } });
  if (!activity) redirect("/staff/volunteers?error=Santa+programme+not+found");
  const duplicate = await prisma.santaBeneficiary.findUnique({ where: { idempotencyKey }, select: { id: true } });
  if (duplicate) redirect(`/staff/volunteers?beneficiary=${duplicate.id}`);
  const beneficiary = await prisma.$transaction(async (tx) => {
    const created = await tx.santaBeneficiary.create({ data: { activityId, childName, age, giftCategory, giftAssigned: text(formData, "giftAssigned") || null, idempotencyKey } });
    await appendEvent(tx, {
      aggregateType: "VolunteerActivity",
      aggregateId: activityId,
      type: "SANTA_BENEFICIARY_ADDED",
      payload: { beneficiaryId: created.id, actorId: staff.id },
      idempotencyKey: `santa-beneficiary:${idempotencyKey}`,
    });
    return created;
  });
  revalidatePath("/staff/volunteers");
  redirect(`/staff/volunteers?beneficiary=${beneficiary.id}`);
}

export async function updateSantaBeneficiary(formData: FormData) {
  const staff = await requireStaff();
  const beneficiaryId = text(formData, "beneficiaryId");
  const distributionStatus = text(formData, "distributionStatus");
  const idempotencyKey = text(formData, "idempotencyKey");
  if (!beneficiaryId || !["PLANNED", "PACKED", "DISTRIBUTED", "NOT_DISTRIBUTED"].includes(distributionStatus) || !z.string().uuid().safeParse(idempotencyKey).success) redirect("/staff/volunteers?error=Invalid+gift+status");
  const beneficiary = await prisma.santaBeneficiary.findUnique({ where: { id: beneficiaryId }, select: { activityId: true } });
  if (!beneficiary) redirect("/staff/volunteers?error=Beneficiary+not+found");
  const receivedConfirmed = checked(formData, "receivedConfirmed");
  await prisma.$transaction(async (tx) => {
    await tx.santaBeneficiary.update({ where: { id: beneficiaryId }, data: { distributionStatus, receivedConfirmed, giftAssigned: text(formData, "giftAssigned") || null } });
    await appendEvent(tx, {
      aggregateType: "VolunteerActivity",
      aggregateId: beneficiary.activityId,
      type: "SANTA_GIFT_STATUS_UPDATED",
      payload: { beneficiaryId, distributionStatus, receivedConfirmed, actorId: staff.id },
      idempotencyKey: `santa-gift-update:${idempotencyKey}`,
    });
  });
  revalidatePath("/staff/volunteers");
}

export async function linkExistingApplicantToSchoolInterest(formData: FormData) {
  const staff = await requireStaff();
  const interestId = text(formData, "interestId");
  const applicantId = text(formData, "applicantId");
  if (!interestId || !applicantId) redirect("/staff/volunteers?error=Choose+an+existing+application");
  const [interest, applicant] = await Promise.all([
    prisma.schoolVisitInterest.findUnique({ where: { id: interestId } }),
    prisma.applicant.findUnique({ where: { id: applicantId }, select: { id: true, phone: true } }),
  ]);
  if (!interest || !applicant) redirect("/staff/volunteers?error=Interest+or+application+not+found");
  if (!interest.contactConsent || !interest.contactNumber || interest.contactNumber.replace(/\D/g, "") !== applicant.phone.replace(/\D/g, "")) {
    redirect("/staff/volunteers?error=Consent+and+a+matching+phone+number+are+required+to+link+an+application");
  }
  if (interest.applicantId) redirect("/staff/volunteers?error=This+interest+is+already+linked");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.schoolVisitInterest.update({ where: { id: interestId }, data: { applicantId, status: "APPLIED" } });
      await appendEvent(tx, {
        aggregateType: "VolunteerActivity",
        aggregateId: interest.activityId,
        type: "SCHOOL_INTEREST_LINKED_TO_APPLICATION",
        payload: { interestId, applicantId, actorId: staff.id },
        idempotencyKey: `school-interest-linked:${interestId}`,
      });
    });
  } catch {
    redirect("/staff/volunteers?error=Could+not+link+the+application.+Check+for+an+existing+link.");
  }
  revalidatePath("/staff/volunteers");
}

export async function updateSchoolInterestStatus(formData: FormData) {
  const staff = await requireStaff();
  const interestId = text(formData, "interestId");
  const nextStatus = text(formData, "status");
  const idempotencyKey = text(formData, "idempotencyKey");
  if (!interestId || !["CONTACTED", "APPLICATION_STARTED", "NOT_INTERESTED"].includes(nextStatus) || !z.string().uuid().safeParse(idempotencyKey).success) redirect("/staff/volunteers?error=Invalid+student+interest+update");
  const interest = await prisma.schoolVisitInterest.findUnique({ where: { id: interestId }, select: { activityId: true, applicantId: true, contactConsent: true, contactNumber: true } });
  if (!interest) redirect("/staff/volunteers?error=Student+interest+not+found");
  if (nextStatus === "APPLICATION_STARTED" && !interest.contactConsent) redirect("/staff/volunteers?error=Contact+consent+is+required+before+application+follow-up");
  await prisma.$transaction(async (tx) => {
    await tx.schoolVisitInterest.update({ where: { id: interestId }, data: { status: nextStatus as "CONTACTED" | "APPLICATION_STARTED" | "NOT_INTERESTED" } });
    await appendEvent(tx, {
      aggregateType: "VolunteerActivity",
      aggregateId: interest.activityId,
      type: "SCHOOL_INTEREST_STATUS_UPDATED",
      payload: { interestId, status: nextStatus, applicantId: interest.applicantId, actorId: staff.id },
      idempotencyKey: `school-interest-status:${idempotencyKey}`,
    });
  });
  revalidatePath("/staff/volunteers");
}

