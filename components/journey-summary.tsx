"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Reads the same merged event history as the Full Timeline card, just
 * narrated in plain English instead of itemized — generated on demand,
 * never auto-run, so it's obviously something staff asked for. */
export function JourneySummary({ applicantId }: { applicantId: string }) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; narrative?: string; error?: string }>({
    status: "idle",
  });

  async function generate() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/ai/journey-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicantId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({ status: "error", error: json.error ?? "Something went wrong" });
        return;
      }
      setState({ status: "done", narrative: json.narrative });
    } catch {
      setState({ status: "error", error: "Could not reach the server" });
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" className="w-full" onClick={generate} disabled={state.status === "loading"}>
        <Sparkles className="size-4" aria-hidden /> {state.status === "loading" ? "Writing…" : "Explain this journey (AI)"}
      </Button>
      {state.status === "error" && <p className="text-xs text-danger">{state.error}</p>}
      {state.status === "done" && (
        <div className="rounded-md border border-accent/30 bg-accent-soft/40 p-3 text-sm text-ink">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accent-strong">
            <Sparkles className="size-3.5" aria-hidden /> AI-generated — a plain-English read of the timeline below
          </p>
          {state.narrative}
        </div>
      )}
    </div>
  );
}
