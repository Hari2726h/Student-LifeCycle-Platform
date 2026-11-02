import { prisma } from "@/lib/prisma";

/** HTTP-level idempotency for mutating form submissions. A fresh key is
 * minted once per page render (not per click) and carried in a hidden
 * field — a network retry or double-click resubmits the *same* key, so
 * the caller can replay the cached outcome instead of re-running the
 * transition. Reloading the page mints a new key, so a deliberate repeat
 * submission is never blocked. This is a different guard from
 * isRealStatusChange (lib/events.ts), which protects against repeated
 * *correct* submissions reaching an already-reached state — this one
 * protects against the same HTTP request logically happening twice. */
export async function checkIdempotencyKey(key: string): Promise<{ seen: boolean; resultMessage: string }> {
  if (!key) return { seen: false, resultMessage: "" };
  const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (!existing) return { seen: false, resultMessage: "" };
  return { seen: true, resultMessage: existing.resultMessage ?? "Already processed" };
}

export async function recordIdempotencyKey(key: string, action: string, resultMessage: string) {
  if (!key) return;
  // A concurrent duplicate could race past checkIdempotencyKey before
  // either has written — the primary key makes the loser's insert throw
  // (P2002) instead of silently recording two outcomes under one key.
  await prisma.idempotencyKey.create({ data: { key, action, resultMessage } }).catch(() => {});
}
