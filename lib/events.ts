import type { Prisma } from "@prisma/client";

/** Appends one row to the event log. Always call this from inside the
 * same $transaction as the domain write it describes — that's what makes
 * the event trustworthy: it can never exist without the change it records,
 * and the change can never happen without leaving a trace. */
export async function appendEvent(
  tx: Prisma.TransactionClient,
  args: { aggregateType: string; aggregateId: string; type: string; payload: Prisma.InputJsonValue },
) {
  return tx.event.create({ data: args });
}

/** Guards a status-change event against two real, ordinary ways to double
 * -fire it: a double-submitted form (network retry, double-click), and a
 * repeatable action that doesn't always actually move the record — e.g.
 * multiple interview panelists each submitting a scorecard, where only the
 * first one actually transitions the applicant's status. Call this instead
 * of `appendEvent` directly whenever the "before" state was read earlier
 * than the transaction that writes the "after" state. */
export function isRealStatusChange(fromStatus: string, toStatus: string) {
  return fromStatus !== toStatus;
}
