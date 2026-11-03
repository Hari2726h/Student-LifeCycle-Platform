"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { wipeAndReplayDerivedState } from "@/lib/demo-tools";

async function requireStaff() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");
}

export async function runWipeAndReplay() {
  await requireStaff();
  const result = await wipeAndReplayDerivedState();
  const message =
    `Wiped ${result.wiped.notifications} notification(s) and ${result.wiped.webhookDeliveries} webhook ` +
    `delivery record(s) — then rebuilt ${result.rebuilt.riskFlagEventsReplayed} risk-flag notification(s), ` +
    `${result.rebuilt.webhookEventsReplayed} webhook deliver${result.rebuilt.webhookEventsReplayed === 1 ? "y" : "ies"}, ` +
    `and ${result.rebuilt.alumniProfilesRecomputed} alumni profile(s) — from the event log alone.`;
  redirect(`/staff/demo-tools?result=${encodeURIComponent(message)}`);
}
