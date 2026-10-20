"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resetWorkerBookmark } from "@/lib/workers/engine";
import { runRiskFlagNotifier, RISK_FLAG_WORKER_NAME } from "@/lib/workers/risk-flag-notifier";

async function requireStaff() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");
}

function withResult(processed: number, mode: string) {
  redirect(`/staff/events?result=${encodeURIComponent(`${mode}: processed ${processed} event${processed === 1 ? "" : "s"}`)}`);
}

export async function processNewEvents() {
  await requireStaff();
  const { processed } = await runRiskFlagNotifier();
  withResult(processed, "Processed new events");
}

export async function replayFromStart() {
  await requireStaff();
  await resetWorkerBookmark(RISK_FLAG_WORKER_NAME, 0);
  const { processed } = await runRiskFlagNotifier();
  withResult(processed, "Replayed from start");
}

export async function replayFromTimestamp(formData: FormData) {
  await requireStaff();
  const raw = formData.get("since");
  if (typeof raw !== "string" || !raw) redirect("/staff/events?error=Pick+a+date+and+time");

  const since = new Date(raw);
  const firstAfter = await prisma.event.findFirst({
    where: { type: "RISK_FLAG_LOGGED", occurredAt: { gte: since } },
    orderBy: { sequence: "asc" },
  });

  // Rewind to just before the first qualifying event — 0 if nothing is
  // that old, meaning "replay everything".
  const rewindTo = firstAfter ? firstAfter.sequence - 1 : 0;
  await resetWorkerBookmark(RISK_FLAG_WORKER_NAME, rewindTo);
  const { processed } = await runRiskFlagNotifier();
  withResult(processed, `Replayed from ${since.toLocaleString()}`);
}
