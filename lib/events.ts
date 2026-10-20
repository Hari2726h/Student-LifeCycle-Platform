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
