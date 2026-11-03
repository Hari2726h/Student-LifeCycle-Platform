-- Run only after scripts/backfill-event-hashes.ts has populated hash/prevHash
-- on every existing row.
ALTER TABLE "Event" ALTER COLUMN "hash" SET NOT NULL;
ALTER TABLE "Event" ALTER COLUMN "prevHash" SET NOT NULL;
