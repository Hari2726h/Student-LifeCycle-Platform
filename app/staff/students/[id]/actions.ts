"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

async function requireStaff() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");
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
