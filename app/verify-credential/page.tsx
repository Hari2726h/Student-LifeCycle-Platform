"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert, BadgeCheck } from "lucide-react";

/** Public, unauthenticated by design — the whole point of a verifiable
 * credential is that anyone (an employer, another institution) can check
 * one without a Maatram login. Paste the JSON a credential file contains;
 * nothing here ever touches a database write, only a signature check. */
export default function VerifyCredentialPage() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<{ status: "idle" | "loading" | "done"; valid?: boolean; reason?: string }>({
    status: "idle",
  });

  async function handleVerify() {
    setState({ status: "loading" });
    let credential: unknown;
    try {
      credential = JSON.parse(input);
    } catch {
      setState({ status: "done", valid: false, reason: "That's not valid JSON." });
      return;
    }
    try {
      const res = await fetch("/api/credentials/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const json = await res.json();
      setState({ status: "done", valid: json.valid, reason: json.reason });
    } catch {
      setState({ status: "done", valid: false, reason: "Could not reach the verification server." });
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-bg px-6 py-12 text-ink">
      <div className="mb-8 flex items-center gap-2">
        <BadgeCheck className="size-6 text-accent" aria-hidden />
        <h1 className="font-serif text-2xl font-semibold">Verify a Maatram credential</h1>
      </div>
      <p className="mb-6 text-sm text-ink-muted">
        Paste the full JSON of a credential issued by the Maatram Student Lifecycle Platform below. This checks a
        real Ed25519 signature over the credential&apos;s content — editing a single field (name, company, date)
        after issuance breaks the signature and is detected here, not merely asserted.
      </p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={14}
        placeholder="Paste credential JSON here…"
        className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
      />

      <button
        type="button"
        onClick={handleVerify}
        disabled={!input.trim() || state.status === "loading"}
        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state.status === "loading" ? "Verifying…" : "Verify signature"}
      </button>

      {state.status === "done" && (
        <div
          className={`mt-6 flex items-start gap-2 rounded-md border p-4 text-sm ${
            state.valid ? "border-success/30 bg-success-soft/50 text-success" : "border-danger/30 bg-danger-soft/50 text-danger"
          }`}
        >
          {state.valid ? <ShieldCheck className="size-5 shrink-0" aria-hidden /> : <ShieldAlert className="size-5 shrink-0" aria-hidden />}
          <div>
            <p className="font-medium">{state.valid ? "Valid — genuinely issued by Maatram, unaltered." : "Not valid."}</p>
            {state.reason && <p className="mt-1 text-xs opacity-90">{state.reason}</p>}
          </div>
        </div>
      )}
    </main>
  );
}
