-- Tier 4 (hard): tamper-evident hash chain on the event log, plus the
-- alumni mentor opt-in / referral-flag columns. hash/prevHash are added
-- nullable here and backfilled by a one-off script (scripts/backfill-event-hashes.ts)
-- before a follow-up migration makes them NOT NULL — Postgres can't backfill
-- a deterministic hash chain in pure SQL alongside the ALTER TABLE.

-- AlterTable
ALTER TABLE "AlumniProfile" ADD COLUMN "openToReferrals" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "hash" TEXT, ADD COLUMN "prevHash" TEXT;

-- AlterTable
ALTER TABLE "Mentor" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
