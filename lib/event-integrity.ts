import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/** The first event in the log chains to this instead of a real hash —
 * same idea as git's all-zeros root commit. */
export const GENESIS_HASH = "0".repeat(64);

/** Deterministic, sorted-key JSON serialization. Postgres's JSONB column
 * silently reorders object keys on storage — without this, hashing
 * `JSON.stringify(payload)` at write time and again at verify time (after
 * a round trip through JSONB) would produce two different strings for the
 * *same* unmodified data, reading as tampering that never happened. Sorting
 * keys before serializing makes both sides agree regardless of storage
 * reordering. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

type HashableEventFields = {
  aggregateType: string;
  aggregateId: string;
  type: string;
  payload: unknown;
  occurredAt: Date;
};

/** One event's hash commits to its own content *and* the previous event's
 * hash — the same construction as a blockchain's block hash, minus the
 * proof-of-work. Editing any historical event's payload (directly in the
 * DB, bypassing the app) changes that event's hash, which breaks every
 * hash after it in the chain — that break is exactly what
 * verifyEventChain() below detects. */
export function computeEventHash(prevHash: string, fields: HashableEventFields): string {
  // A plain JSON round-trip before canonicalizing, not just stableStringify
  // on the raw value — `undefined` object values/array elements and `Date`
  // instances serialize one way via plain `JSON.stringify` (which is what
  // Postgres's own JSONB storage does: drops `undefined` keys, turns array
  // `undefined` into `null`, calls `Date.prototype.toJSON()`) but would
  // stableStringify completely differently if hashed raw (an un-normalized
  // `Date` has no enumerable own keys, so it would stringify as `{}`; a raw
  // `undefined` would stringify as the bare word `undefined`, not valid
  // JSON at all). Round-tripping first means the write-time hash (computed
  // from the in-memory value before it's ever touched Postgres) and the
  // verify-time hash (computed from the value *after* a JSONB round trip)
  // always canonicalize the same already-normalized shape — so an
  // unmodified event can never falsely appear tampered with just because
  // of how a payload field happened to be typed.
  const normalizedPayload = fields.payload === undefined ? null : JSON.parse(JSON.stringify(fields.payload));
  const canonical = [
    prevHash,
    fields.aggregateType,
    fields.aggregateId,
    fields.type,
    stableStringify(normalizedPayload),
    fields.occurredAt.toISOString(),
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export type EventChainVerification = {
  valid: boolean;
  totalChecked: number;
  brokenAtSequence: number | null;
  reason: string | null;
};

/** Walks the entire log in sequence order and recomputes every hash from
 * scratch — not just checking that each row's stored hash looks
 * well-formed, but that it's the hash you'd *actually get* from that row's
 * content chained to its predecessor. Two independent things can break
 * this: a row's own content being edited (its recomputed hash no longer
 * matches what's stored), or a row being inserted/deleted/reordered out of
 * band (its stored prevHash no longer matches the previous row's hash). */
export async function verifyEventChain(): Promise<EventChainVerification> {
  const events = await prisma.event.findMany({ orderBy: { sequence: "asc" } });

  let expectedPrevHash = GENESIS_HASH;
  for (const event of events) {
    if (event.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalChecked: events.length,
        brokenAtSequence: event.sequence,
        reason: `Event #${event.sequence} points to a prevHash that doesn't match the actual previous event's hash — the chain has been reordered, or an event was inserted/deleted out of band.`,
      };
    }

    const recomputed = computeEventHash(event.prevHash, {
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt,
    });
    if (recomputed !== event.hash) {
      return {
        valid: false,
        totalChecked: events.length,
        brokenAtSequence: event.sequence,
        reason: `Event #${event.sequence}'s content no longer matches its recorded hash — this row was edited after being written.`,
      };
    }

    expectedPrevHash = event.hash;
  }

  return { valid: true, totalChecked: events.length, brokenAtSequence: null, reason: null };
}
