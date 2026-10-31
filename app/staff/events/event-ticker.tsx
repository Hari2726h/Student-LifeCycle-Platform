"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { checkForNewEvents } from "./actions";

/** Polls every 5s so the event log feels alive during a demo instead of a
 * static table someone has to manually reload. No websockets needed at
 * this scale — it's one indexed count query. */
export function EventTicker({ initialLatestSequence }: { initialLatestSequence: number }) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(initialLatestSequence);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      const { newCount: count } = await checkForNewEvents(baseline);
      setNewCount(count);
    }, 5000);
    return () => clearInterval(interval);
  }, [baseline]);

  if (newCount === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
        <Radio className="size-3.5 animate-pulse text-success" aria-hidden /> Live
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setBaseline((b) => b + newCount);
        setNewCount(0);
        router.refresh();
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-strong hover:bg-accent-soft/70"
    >
      <Radio className="size-3.5 animate-pulse" aria-hidden />
      {newCount} new event{newCount === 1 ? "" : "s"} — click to refresh
    </button>
  );
}
