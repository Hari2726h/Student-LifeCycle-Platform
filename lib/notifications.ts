import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function getUnreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { recipientId: userId, read: false } });
}

export async function notifyApplicant(
  tx: Prisma.TransactionClient,
  applicantId: string,
  sourceEventId: string,
  title: string,
  body: string,
) {
  const applicant = await tx.applicant.findUnique({ where: { id: applicantId }, select: { userId: true } });
  if (!applicant) return;
  await tx.notification.upsert({
    where: { sourceEventId_recipientId: { sourceEventId, recipientId: applicant.userId } },
    create: { sourceEventId, recipientId: applicant.userId, type: "APPLICANT_UPDATE", title, body },
    update: {},
  });
}
