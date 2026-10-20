"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { appendEvent } from "@/lib/events";
import { runRiskFlagNotifier } from "@/lib/workers/risk-flag-notifier";

const checkInSchema = z.object({
  studentId: z.string().min(1),
  mentorId: z.string().min(1),
  category: z.enum(["ACADEMIC", "ATTENDANCE", "FINANCIAL", "PERSONAL", "OTHER"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  isRiskFlag: z.coerce.boolean(),
  note: z.string().min(1, "Add a note"),
});

/** Logs a structured check-in. The write and its event are one transaction
 * — a risk flag can't exist in the log without also existing in the event
 * stream. The notifier worker is invoked inline afterward, but its safety
 * lag means an event this fresh won't actually be picked up yet — it'll
 * process on the worker's next run (manual, via /staff/events, or a real
 * scheduler in production). That's the correct tradeoff: never skip a
 * same-batch out-of-order commit just to shave a couple of seconds off
 * notification latency. */
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

  const student = await prisma.student.findUniqueOrThrow({ where: { id: data.studentId }, include: { user: true } });

  await prisma.$transaction(async (tx) => {
    const log = await tx.mentorLog.create({ data });

    await appendEvent(tx, {
      aggregateType: "MentorLog",
      aggregateId: log.id,
      type: "MENTOR_LOG_CREATED",
      payload: { studentId: data.studentId, mentorId: data.mentorId, category: data.category, isRiskFlag: data.isRiskFlag },
    });

    if (data.isRiskFlag) {
      await appendEvent(tx, {
        aggregateType: "MentorLog",
        aggregateId: log.id,
        type: "RISK_FLAG_LOGGED",
        payload: {
          studentId: data.studentId,
          studentName: student.user.name,
          category: data.category,
          severity: data.severity,
          note: data.note,
        },
      });
    }
  });

  if (data.isRiskFlag) {
    await runRiskFlagNotifier();
  }

  revalidatePath("/mentor");
  revalidatePath(`/mentor/students/${data.studentId}`);
}
