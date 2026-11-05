import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** HTTP-level idempotency for mutating form submissions. A fresh key is
 * minted once per page render (not per click) and carried in a hidden
 * field — a network retry or double-click resubmits the *same* key, so
 * the caller can replay the cached outcome instead of re-running the
 * transition. Reloading the page mints a new key, so a deliberate repeat
 * submission is never blocked. This is a different guard from
 * isRealStatusChange (lib/events.ts), which protects against repeated
 * *correct* submissions reaching an already-reached state — this one
 * protects against the same HTTP request logically happening twice.
 *
 * Claim-first: the key row is inserted *before* the transition runs, not
 * after — a check-then-act version of this (read "has this key been
 * seen?", then later write it) leaves a window where two concurrent
 * requests with the same key both read "not seen" and both run the
 * transition. Inserting first makes Postgres's primary-key uniqueness do
 * the serializing: only one of two concurrent callers can win the insert,
 * and the loser never runs the transition at all. */
export type ClaimResult = { claimed: true } | { claimed: false; resultMessage: string };

export async function claimIdempotencyKey(key: string, action: string): Promise<ClaimResult> {
  if (!key) return { claimed: true };

  try {
    await prisma.idempotencyKey.create({ data: { key, action, resultMessage: null } });
    return { claimed: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
      return { claimed: false, resultMessage: existing?.resultMessage ?? "Your earlier request is still being processed" };
    }
    throw err;
  }
}

export async function finalizeIdempotencyKey(key: string, resultMessage: string) {
  if (!key) return;
  await prisma.idempotencyKey.update({ where: { key }, data: { resultMessage } }).catch(() => {});
}
