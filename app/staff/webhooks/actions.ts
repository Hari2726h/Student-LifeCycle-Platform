"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resetWorkerBookmark } from "@/lib/workers/engine";
import { runWebhookDispatcher, generateWebhookSecret, WEBHOOK_WORKER_NAME, WEBHOOK_EVENT_TYPES } from "@/lib/webhooks";

async function requireStaff() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");
  return session.user;
}

export async function createSubscription(formData: FormData) {
  const user = await requireStaff();

  const url = String(formData.get("url") ?? "").trim();
  const eventTypes = formData.getAll("eventTypes").map(String).filter((t) => (WEBHOOK_EVENT_TYPES as readonly string[]).includes(t));

  if (!url || !/^https?:\/\//.test(url)) {
    redirect("/staff/webhooks?error=Enter+a+valid+http(s)+URL");
  }
  if (eventTypes.length === 0) {
    redirect("/staff/webhooks?error=Select+at+least+one+event+type");
  }

  await prisma.webhookSubscription.create({
    data: { url, eventTypes, secret: generateWebhookSecret(), createdById: user.id },
  });

  redirect("/staff/webhooks?result=Subscription+created");
}

export async function toggleSubscription(subscriptionId: string, formData: FormData) {
  await requireStaff();
  const isActive = formData.get("isActive") === "true";
  await prisma.webhookSubscription.update({ where: { id: subscriptionId }, data: { isActive: !isActive } });
  redirect(`/staff/webhooks?result=${isActive ? "Paused" : "Resumed"}+subscription`);
}

export async function deleteSubscription(subscriptionId: string) {
  await requireStaff();
  await prisma.webhookSubscription.delete({ where: { id: subscriptionId } });
  redirect("/staff/webhooks?result=Subscription+deleted");
}

export async function runDispatcherNow() {
  await requireStaff();
  const { processed } = await runWebhookDispatcher();
  redirect(`/staff/webhooks?result=${encodeURIComponent(`Dispatched against ${processed} new event${processed === 1 ? "" : "s"}`)}`);
}

export async function replayWebhooksFromStart() {
  await requireStaff();
  await resetWorkerBookmark(WEBHOOK_WORKER_NAME, 0);
  const { processed } = await runWebhookDispatcher();
  redirect(`/staff/webhooks?result=${encodeURIComponent(`Replayed from start — ${processed} event(s) re-checked`)}`);
}
