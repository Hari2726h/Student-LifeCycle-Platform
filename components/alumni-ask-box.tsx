"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** A bounded natural-language query over the real alumni/career data — the
 * server builds the prompt fresh from the live directory on every request
 * (see app/api/ai/alumni-query/route.ts), so this can only answer from
 * what's actually in the database, not general knowledge. Degrades to a
 * plain setup message if GEMINI_API_KEY isn't configured. */
export function AlumniAskBox() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; answer?: string; error?: string }>({
    status: "idle",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/ai/alumni-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({ status: "error", error: json.error ?? "Something went wrong" });
        return;
      }
      setState({ status: "done", answer: json.answer });
    } catch {
      setState({ status: "error", error: "Could not reach the server" });
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Field
          label="Ask about alumni"
          name="question"
          placeholder="e.g. Which alumni work in tech, and who should I ask for a referral?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="primary" className="h-[38px] self-end" disabled={state.status === "loading"}>
          <Sparkles className="size-4" aria-hidden /> {state.status === "loading" ? "Thinking…" : "Ask"}
        </Button>
      </form>

      {state.status === "error" && <p className="text-sm text-danger">{state.error}</p>}
      {state.status === "done" && (
        <div className="rounded-md border border-accent/30 bg-accent-soft/40 p-3 text-sm text-ink">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accent-strong">
            <Sparkles className="size-3.5" aria-hidden /> AI answer — from the current alumni directory only
          </p>
          {state.answer}
        </div>
      )}
    </div>
  );
}
