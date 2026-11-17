/** One-off: computes hash/prevHash for every Event row that predates the
 * hash-chain feature, in sequence order, using the exact same function
 * lib/events.ts uses going forward — so the backfilled prefix and the
 * live tail chain together as one continuous, verifiable log. Run once,
 * after the migration that adds the (nullable) columns and before the
 * migration that makes them NOT NULL. Safe to re-run — idempotent, since
 * it always recomputes from current row content. */
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { computeEventHash, GENESIS_HASH } from "../lib/event-integrity";

async function main() {
  // Read through raw SQL because the Prisma model already declares these
  // columns non-nullable, while the migration deliberately adds them as
  // nullable so this backfill can populate existing rows first.
  const events = await prisma.$queryRaw<Array<{
    id: string;
    aggregateType: string;
    aggregateId: string;
    type: string;
    payload: Prisma.JsonValue;
    occurredAt: Date;
  }>>`SELECT "id", "aggregateType", "aggregateId", "type", "payload", "occurredAt"
       FROM "Event" ORDER BY "sequence" ASC`;
  let prevHash = GENESIS_HASH;
  let updated = 0;

  for (const event of events) {
    const hash = computeEventHash(prevHash, {
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt,
    });
    await prisma.$executeRaw`UPDATE "Event" SET "hash" = ${hash}, "prevHash" = ${prevHash} WHERE "id" = ${event.id}`;
    prevHash = hash;
    updated++;
  }

  console.log(`✔ Backfilled hash chain for ${updated} event(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
