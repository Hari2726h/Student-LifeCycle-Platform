"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireStaff() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");
  return session.user;
}

export async function markNotificationRead(notificationId: string) {
  const user = await requireStaff();
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientId: user.id },
    data: { read: true },
  });
  revalidatePath("/staff/notifications");
  revalidatePath("/staff");
}

export async function markAllNotificationsRead() {
  const user = await requireStaff();
  await prisma.notification.updateMany({
    where: { recipientId: user.id, read: false },
    data: { read: true },
  });
  revalidatePath("/staff/notifications");
  revalidatePath("/staff");
}
