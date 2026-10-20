import { prisma } from "@/lib/prisma";
import { runWorker } from "./engine";

export const RISK_FLAG_WORKER_NAME = "risk-flag-notifier";

type RiskFlagPayload = {
  studentId: string;
  studentName: string;
  category: string;
  severity: string;
  note: string;
};

/** Turns a RISK_FLAG_LOGGED event into a Notification for every active
 * staff member. The (sourceEventId, recipientId) unique constraint on
 * Notification is what makes this idempotent: replaying the same event
 * twice upserts the same row rather than sending a second alert. */
export async function runRiskFlagNotifier() {
  const staff = await prisma.user.findMany({ where: { role: "STAFF", isActive: true } });

  return runWorker({
    workerName: RISK_FLAG_WORKER_NAME,
    eventTypes: ["RISK_FLAG_LOGGED"],
    handle: async (event) => {
      const payload = event.payload as RiskFlagPayload;
      for (const s of staff) {
        await prisma.notification.upsert({
          where: { sourceEventId_recipientId: { sourceEventId: event.id, recipientId: s.id } },
          update: {},
          create: {
            recipientId: s.id,
            type: "RISK_FLAG",
            title: `Risk flag: ${payload.studentName}`,
            body: `${payload.category.toLowerCase()} · ${payload.severity.toLowerCase()} — ${payload.note}`,
            studentId: payload.studentId,
            sourceEventId: event.id,
          },
        });
      }
    },
  });
}
