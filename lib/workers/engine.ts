import { prisma } from "@/lib/prisma";
import type { Event } from "@prisma/client";

const DEFAULT_SAFETY_LAG_MS = 2000;

/**
 * The shared replay loop every worker runs on. Three things make this safe
 * to call repeatedly, from any starting point:
 *
 * 1. Cursor is `sequence` (a Postgres SERIAL, assigned at INSERT time), not
 *    a timestamp — timestamps aren't a safe cursor because two concurrent
 *    transactions can grab sequence 5 and 6 and commit in either order.
 * 2. A `safetyLagMs` window: we only process events older than "now minus
 *    the lag", giving any in-flight transaction time to commit first. This
 *    is what "without missing events committed out of order" means in
 *    practice — without it, a worker could race ahead of a still-committing
 *    lower-sequence event and never see it once its bookmark passes it.
 * 3. The bookmark advances once per event, not once per batch — a crash
 *    mid-run resumes from the last *fully processed* event, not from zero
 *    and not past unprocessed ones.
 */
export async function runWorker({
  workerName,
  eventTypes,
  safetyLagMs = DEFAULT_SAFETY_LAG_MS,
  handle,
}: {
  workerName: string;
  eventTypes: string[];
  safetyLagMs?: number;
  handle: (event: Event) => Promise<void>;
}) {
  const bookmark = await prisma.replayBookmark.upsert({
    where: { workerName },
    update: {},
    create: { workerName, lastSequence: 0 },
  });

  const safeUntil = new Date(Date.now() - safetyLagMs);
  const events = await prisma.event.findMany({
    where: { type: { in: eventTypes }, sequence: { gt: bookmark.lastSequence }, occurredAt: { lte: safeUntil } },
    orderBy: { sequence: "asc" },
  });

  let processed = 0;
  for (const event of events) {
    await handle(event);
    await prisma.replayBookmark.update({ where: { workerName }, data: { lastSequence: event.sequence } });
    processed++;
  }

  return { processed, lastSequence: events.at(-1)?.sequence ?? bookmark.lastSequence };
}

/** Rewinds a worker's bookmark so the next run reprocesses from there —
 * "replay from start" is `toSequence: 0`; "replay from a timestamp" is
 * `toSequence: <sequence of the last event before that time>`. */
export async function resetWorkerBookmark(workerName: string, toSequence = 0) {
  await prisma.replayBookmark.upsert({
    where: { workerName },
    update: { lastSequence: toSequence },
    create: { workerName, lastSequence: toSequence },
  });
}
