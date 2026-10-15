"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

async function requireMentorOf(studentId: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "MENTOR") redirect("/login");

  const mentor = await prisma.mentor.findUniqueOrThrow({ where: { userId: session.user.id } });
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  if (student.mentorId !== mentor.id) redirect("/mentor?error=Not+your+mentee");

  return mentor;
}

const certSchema = z.object({
  courseCatalogId: z.string().optional(),
  name: z.string().min(2),
  issuer: z.string().optional(),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "LAPSED"]),
});

export async function addCertification(studentId: string, formData: FormData) {
  await requireMentorOf(studentId);

  const parsed = certSchema.safeParse({
    courseCatalogId: formData.get("courseCatalogId") || undefined,
    name: formData.get("name"),
    issuer: formData.get("issuer") || undefined,
    status: formData.get("status"),
  });
  if (!parsed.success) return;
  const data = parsed.data;

  await prisma.certification.create({
    data: {
      studentId,
      courseCatalogId: data.courseCatalogId || null,
      name: data.name,
      issuer: data.issuer || null,
      status: data.status,
      startedAt: new Date(),
      completedAt: data.status === "COMPLETED" ? new Date() : null,
    },
  });

  revalidatePath(`/mentor/students/${studentId}`);
}

const academicSchema = z.object({
  semester: z.coerce.number().int().min(1).max(12),
  gpa: z.coerce.number().min(0).max(10),
  attendancePercent: z.coerce.number().min(0).max(100),
});

export async function addAcademicRecord(studentId: string, formData: FormData) {
  await requireMentorOf(studentId);

  const parsed = academicSchema.safeParse({
    semester: formData.get("semester"),
    gpa: formData.get("gpa"),
    attendancePercent: formData.get("attendancePercent"),
  });
  if (!parsed.success) return;

  await prisma.academicRecord.upsert({
    where: { studentId_semester: { studentId, semester: parsed.data.semester } },
    create: { studentId, ...parsed.data },
    update: { ...parsed.data },
  });

  revalidatePath(`/mentor/students/${studentId}`);
}
