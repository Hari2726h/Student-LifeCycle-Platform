"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { appendEvent, isRealStatusChange } from "@/lib/events";
import { addCareerEventTx } from "@/lib/alumni-career";
import { redirectWithFieldError } from "@/lib/form-errors";
import { ROLE_HOME } from "@/lib/roles";

async function requireStaff() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "STAFF") redirect(ROLE_HOME[session.user.role]);
  return session.user;
}

const followUpSchema = z.object({
  studentId: z.string().min(1),
  assignedToId: z.string().min(1),
  note: z.string().min(2, "Describe the follow-up"),
});

export async function createFollowUp(formData: FormData) {
  const user = await requireStaff();

  const parsed = followUpSchema.safeParse({
    studentId: formData.get("studentId"),
    assignedToId: formData.get("assignedToId"),
    note: formData.get("note"),
  });
  if (!parsed.success) return;

  await prisma.followUpAction.create({
    data: { ...parsed.data, createdById: user.id },
  });

  revalidatePath(`/staff/students/${parsed.data.studentId}`);
  revalidatePath("/staff");
}

export async function resolveFollowUp(followUpId: string, studentId: string) {
  await requireStaff();
  await prisma.followUpAction.update({
    where: { id: followUpId },
    data: { status: "DONE", resolvedAt: new Date() },
  });
  revalidatePath(`/staff/students/${studentId}`);
  revalidatePath("/staff");
}

export async function resolveRiskFlag(logId: string, studentId: string) {
  const user = await requireStaff();
  await prisma.mentorLog.update({
    where: { id: logId },
    data: { resolvedAt: new Date(), resolvedById: user.id },
  });
  revalidatePath(`/staff/students/${studentId}`);
  revalidatePath("/staff");
}

const promoteSchema = z.object({
  company: z.string().trim().optional(),
  role: z.string().trim().optional(),
  packageInrLakhs: z.coerce.number().positive().optional(),
  joiningDate: z.coerce.date().optional(),
});

/** The only path that turns a Student into an alumnus. Without this,
 * ONBOARDING/ACTIVE/PLACED were a dead end — the seed script could
 * fabricate ALUMNI rows directly, but nothing in the running app ever
 * could, which meant the alumni career tracker (lib/alumni-career.ts) had
 * no way to ever gain a new real alumnus. Company/role are optional: a
 * student can graduate without a placement in hand and self-report their
 * career later from /portal — but when they're given, this seeds their
 * first CareerEvent from the same placement record, so the two don't
 * drift into two different, disagreeing stories of the same fact. */
export async function promoteToAlumnus(studentId: string, formData: FormData) {
  const user = await requireStaff();

  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  if (student.status === "ALUMNI") redirect(`/staff/students/${studentId}`);
  if (student.status === "WITHDRAWN" || student.status === "DROPPED_OUT") {
    redirect(`/staff/students/${studentId}?error=Can%27t+promote+a+withdrawn+or+dropped-out+student`);
  }

  const parsed = promoteSchema.safeParse({
    company: formData.get("company") || undefined,
    role: formData.get("role") || undefined,
    packageInrLakhs: formData.get("packageInrLakhs") || undefined,
    joiningDate: formData.get("joiningDate") || undefined,
  });
  if (!parsed.success) redirectWithFieldError(`/staff/students/${studentId}`, parsed.error, "Invalid input");
  const data = parsed.data;
  const hasPlacement = !!(data.company && data.role);

  // All in one transaction — including the first CareerEvent when there's
  // a placement. Splitting this into two transactions (promote, then
  // separately add the career event) left a real gap: a failure between
  // them would commit the student as permanently ALUMNI with a Placement
  // record but no CareerEvent and no derived currentCompany/currentRole,
  // two disagreeing stories of the same fact with no automatic recovery.
  await prisma.$transaction(async (tx) => {
    if (hasPlacement) {
      await tx.placement.upsert({
        where: { studentId },
        create: { studentId, company: data.company!, role: data.role!, packageInrLakhs: data.packageInrLakhs, joiningDate: data.joiningDate },
        update: { company: data.company!, role: data.role!, packageInrLakhs: data.packageInrLakhs, joiningDate: data.joiningDate },
      });
    }

    const existingProfile = await tx.alumniProfile.findUnique({ where: { studentId } });
    const profile = existingProfile ?? (await tx.alumniProfile.create({ data: { studentId } }));

    await tx.student.update({ where: { id: studentId }, data: { status: "ALUMNI" } });

    if (isRealStatusChange(student.status, "ALUMNI")) {
      await appendEvent(tx, {
        aggregateType: "Student",
        aggregateId: studentId,
        type: "STUDENT_STATUS_CHANGED",
        payload: { fromStatus: student.status, toStatus: "ALUMNI", actorId: user.id },
      });
    }

    if (hasPlacement) {
      await addCareerEventTx(tx, {
        alumniProfileId: profile.id,
        source: "PLACEMENT",
        company: data.company!,
        role: data.role!,
        startDate: data.joiningDate ?? new Date(),
      });
    }
  });

  revalidatePath(`/staff/students/${studentId}`);
  redirect(`/staff/students/${studentId}`);
}
