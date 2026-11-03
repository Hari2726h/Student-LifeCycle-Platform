"use client";

import { useMemo, useState } from "react";
import { History, Clock } from "lucide-react";
import type { Event } from "@prisma/client";
import { reduceTimelineAt } from "@/lib/time-travel";
import { describePersonTimelineEvent } from "@/lib/person-timeline";
import { Badge } from "@/components/ui/badge";

/** Drag the slider, watch the record's state at that point replay live —
 * entirely client-side against the events the server already fetched, so
 * there's no round trip per drag. This is a readable demonstration of what
 * event sourcing buys you: the record's full history was always there,
 * this just lets you scrub through it. */
export function TimeTravelViewer({ events }: { events: Event[] }) {
  const [index, setIndex] = useState(Math.max(events.length - 1, 0));

  const state = useMemo(() => reduceTimelineAt(events, index), [events, index]);
  const current = events[index];

  if (events.length === 0) {
    return <p className="text-sm text-ink-faint">No recorded events yet — nothing to replay.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Clock className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <input
          type="range"
          min={0}
          max={events.length - 1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="h-1.5 w-full appearance-none rounded-full bg-border accent-accent"
        />
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-faint">
          {index + 1}/{events.length}
        </span>
      </div>

      <div className="rounded-md border border-border bg-canvas-subtle/60 p-3">
        <p className="flex items-center gap-1.5 text-xs text-ink-faint">
          <History className="size-3.5" aria-hidden /> At {current.occurredAt.toLocaleString()} —{" "}
          {describePersonTimelineEvent(current.type, (current.payload ?? {}) as Record<string, unknown>)}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-faint">Application status</dt>
            <dd className="text-ink">{state.applicantStatus ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Student status</dt>
            <dd className="text-ink">{state.isStudent ? (state.studentStatus ?? "ONBOARDING") : "not yet a student"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Mentor check-ins</dt>
            <dd className="text-ink">{state.checkIns}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Career position</dt>
            <dd className="text-ink">{state.currentRole && state.currentCompany ? `${state.currentRole} at ${state.currentCompany}` : "—"}</dd>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-xs text-ink-faint">Risk flags so far ({state.riskFlags.length})</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {state.riskFlags.length === 0 ? (
                <span className="text-ink-faint">none</span>
              ) : (
                state.riskFlags.map((f, i) => (
                  <Badge key={i} tone={f.severity === "HIGH" ? "danger" : f.severity === "MEDIUM" ? "warning" : "neutral"}>
                    {f.category.toLowerCase()}
                  </Badge>
                ))
              )}
            </dd>
          </div>
        </dl>
      </div>
      <p className="text-xs text-ink-faint">
        Career position here is a quick reconstruction from event payloads, not the authoritative replay in the
        alumni career tracker — for the exact current role, see /staff/alumni.
      </p>
    </div>
  );
}
