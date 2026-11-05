"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resetWorkerBookmark } from "@/lib/workers/engine";
import { runWebhookDispatcher, generateWebhookSecret, webhookBookmarkName, WEBHOOK_EVENT_TYPES } from "@/lib/webhooks";
import { assertSafeWebhookUrl, UnsafeWebhookUrlError } from "@/lib/ssrf-guard";

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

  try {
    await assertSafeWebhookUrl(url);
  } catch (err) {
    const message = err instanceof UnsafeWebhookUrlError ? err.message : "Could not validate that URL";
    redirect(`/staff/webhooks?error=${encodeURIComponent(message)}`);
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
  // Each subscription has its own bookmark (see lib/webhooks.ts) — reset
  // every active one, not a single shared cursor.
  const subscriptions = await prisma.webhookSubscription.findMany({ where: { isActive: true }, select: { id: true } });
  await Promise.all(subscriptions.map((sub) => resetWorkerBookmark(webhookBookmarkName(sub.id), 0)));
  const { processed } = await runWebhookDispatcher();
  redirect(`/staff/webhooks?result=${encodeURIComponent(`Replayed from start — ${processed} event(s) re-checked`)}`);
}
