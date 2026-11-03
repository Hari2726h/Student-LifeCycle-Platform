import { prisma } from "@/lib/prisma";
import { resetWorkerBookmark } from "@/lib/workers/engine";
import { runRiskFlagNotifier, RISK_FLAG_WORKER_NAME } from "@/lib/workers/risk-flag-notifier";
import { runWebhookDispatcher, WEBHOOK_WORKER_NAME } from "@/lib/webhooks";
import { recomputeAllProfiles } from "@/lib/alumni-career";

/** The live version of this app's whole thesis: every one of these tables
 * is a *projection* of the Event log, not a second source of truth — so
 * wiping them and rebuilding from nothing but the events proves they were
 * never load-bearing on their own. This deliberately never touches
 * Event/CareerEvent (the actual sources of truth) or any of the core
 * domain tables (Applicant, Student, Verification, InterviewRecord, …) —
 * only the three caches/derived stores that exist purely to avoid
 * recomputing from the log on every read:
 *   - Notification (derived from RISK_FLAG_LOGGED events)
 *   - WebhookDelivery + both workers' ReplayBookmarks (replay cursors)
 *   - AlumniProfile.currentCompany/currentRole (derived from CareerEvent)
 */
export async function wipeAndReplayDerivedState() {
  const [notificationsWiped, deliveriesWiped] = await Promise.all([
    prisma.notification.deleteMany({}),
    prisma.webhookDelivery.deleteMany({}),
  ]);
  await prisma.alumniProfile.updateMany({ data: { currentCompany: null, currentRole: null } });
  await resetWorkerBookmark(RISK_FLAG_WORKER_NAME, 0);
  await resetWorkerBookmark(WEBHOOK_WORKER_NAME, 0);

  const [riskFlagResult, webhookResult, profilesResult] = await Promise.all([
    runRiskFlagNotifier(),
    runWebhookDispatcher(),
    recomputeAllProfiles(),
  ]);

  return {
    wiped: { notifications: notificationsWiped.count, webhookDeliveries: deliveriesWiped.count },
    rebuilt: {
      riskFlagEventsReplayed: riskFlagResult.processed,
      webhookEventsReplayed: webhookResult.processed,
      alumniProfilesRecomputed: profilesResult.recomputed,
    },
  };
}
