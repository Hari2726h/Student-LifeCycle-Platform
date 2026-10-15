"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const checkInSchema = z.object({
  studentId: z.string().min(1),
  mentorId: z.string().min(1),
  category: z.enum(["ACADEMIC", "ATTENDANCE", "FINANCIAL", "PERSONAL", "OTHER"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  isRiskFlag: z.coerce.boolean(),
  note: z.string().min(1, "Add a note"),
});

/** Logs a structured check-in. A risk flag isn't just a database write —
 * it creates a real notification for every active staff member, so the
 * write → surface → act loop actually closes. */
export async function logCheckIn(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.role !== "MENTOR") redirect("/login");

  const parsed = checkInSchema.safeParse({
    studentId: formData.get("studentId"),
    mentorId: formData.get("mentorId"),
    category: formData.get("category"),
    severity: formData.get("severity"),
    isRiskFlag: formData.get("isRiskFlag"),
    note: formData.get("note"),
  });
  if (!parsed.success) return;
  const data = parsed.data;

  await prisma.mentorLog.create({ data });

  if (data.isRiskFlag) {
    const student = await prisma.student.findUniqueOrThrow({ where: { id: data.studentId }, include: { user: true } });
    const staff = await prisma.user.findMany({ where: { role: "STAFF", isActive: true } });
    if (staff.length > 0) {
      await prisma.notification.createMany({
        data: staff.map((s) => ({
          recipientId: s.id,
          type: "RISK_FLAG" as const,
          title: `Risk flag: ${student.user.name}`,
          body: `${data.category.toLowerCase()} · ${data.severity.toLowerCase()} — ${data.note}`,
          studentId: data.studentId,
        })),
      });
    }
  }

  revalidatePath("/mentor");
  revalidatePath(`/mentor/students/${data.studentId}`);
}
