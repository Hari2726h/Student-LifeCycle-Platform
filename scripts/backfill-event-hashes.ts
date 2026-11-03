/** One-off: computes hash/prevHash for every Event row that predates the
 * hash-chain feature, in sequence order, using the exact same function
 * lib/events.ts uses going forward — so the backfilled prefix and the
 * live tail chain together as one continuous, verifiable log. Run once,
 * after the migration that adds the (nullable) columns and before the
 * migration that makes them NOT NULL. Safe to re-run — idempotent, since
 * it always recomputes from current row content. */
import { prisma } from "../lib/prisma";
import { computeEventHash, GENESIS_HASH } from "../lib/event-integrity";

async function main() {
  const events = await prisma.event.findMany({ orderBy: { sequence: "asc" } });
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
    await prisma.event.update({ where: { id: event.id }, data: { hash, prevHash } });
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
