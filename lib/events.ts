import type { Prisma } from "@prisma/client";
import { computeEventHash, GENESIS_HASH } from "./event-integrity";

// A fixed, arbitrary key for a Postgres advisory lock scoped to this
// transaction (released automatically on commit/rollback) — serializes
// concurrent appendEvent calls so two transactions can never both read the
// same "last hash" and write two events claiming the same parent. Without
// this, concurrent writers could fork the hash chain the same way two
// people committing to git at once could with no lock at all.
const CHAIN_LOCK_KEY = 72176503;

/** Appends one row to the event log. Always call this from inside the
 * same $transaction as the domain write it describes — that's what makes
 * the event trustworthy: it can never exist without the change it records,
 * and the change can never happen without leaving a trace.
 *
 * Also chains a SHA-256 hash to the previous event's hash (see
 * lib/event-integrity.ts) — tamper-evident, not tamper-proof: nothing
 * stops a direct DB edit, but verifyEventChain() will catch it, because
 * editing row N's content (or its position in the chain) breaks every
 * hash from N onward. */
export async function appendEvent(
  tx: Prisma.TransactionClient,
  args: { aggregateType: string; aggregateId: string; type: string; payload: Prisma.InputJsonValue },
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;

  const last = await tx.event.findFirst({ orderBy: { sequence: "desc" }, select: { hash: true } });
  const prevHash = last?.hash ?? GENESIS_HASH;
  const occurredAt = new Date();
  const hash = computeEventHash(prevHash, {
    aggregateType: args.aggregateType,
    aggregateId: args.aggregateId,
    type: args.type,
    payload: args.payload,
    occurredAt,
  });

  return tx.event.create({ data: { ...args, occurredAt, prevHash, hash } });
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
