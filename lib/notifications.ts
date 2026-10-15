import { prisma } from "@/lib/prisma";

export async function getUnreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { recipientId: userId, read: false } });
}
