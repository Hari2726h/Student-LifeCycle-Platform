"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { WifiOff, RefreshCw } from "lucide-react";
import { Select, Field, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { queueVerification, flushQueuedVerifications, listQueuedVerifications } from "@/lib/offline-queue";

type Verification = {
  decision: string;
  incomeBandVerified: boolean;
  housingCondition: string | null;
  householdSizeConfirmed: number | null;
  photoEvidenceConfirmed: boolean;
  notes: string | null;
} | null;

/** A field visit happens wherever the applicant lives — not guaranteed to
 * have signal. This submits over fetch instead of a server action so a
 * failed request (offline, or mid-visit signal drop) can fall back to an
 * IndexedDB queue instead of just failing; "Process new events"-style
 * eventual consistency, same idea as the rest of this app, just starting
 * from the volunteer's phone instead of the event log. */
export function VerificationForm({ applicantId, verification }: { applicantId: string; verification: Verification }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "queued" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    const items = await listQueuedVerifications();
    setPendingCount(items.length);
  }, []);

  const sync = useCallback(async () => {
    const { synced } = await flushQueuedVerifications();
    await refreshPendingCount();
    if (synced > 0) router.refresh();
  }, [refreshPendingCount, router]);

  useEffect(() => {
    listQueuedVerifications().then((items) => setPendingCount(items.length));
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("applicantId", applicantId);
    // Unchecked checkboxes don't appear in FormData at all — the server
    // schema coerces "on"/missing into booleans, so make the "unchecked"
    // case explicit for both the live request and the offline-queued copy.
    for (const name of ["incomeBandVerified", "photoEvidenceConfirmed", "duplicateCheckPassed"]) {
      if (!formData.has(name)) formData.set(name, "false");
    }

    try {
      const res = await fetch("/api/offline/verification", { method: "POST", body: formData });
      const json = await res.json().catch(() => ({ ok: false, error: "Unexpected response" }));
      if (!res.ok || !json.ok) {
        setStatus("error");
        setError(json.error ?? "Could not save");
        return;
      }
      setStatus("saved");
      router.refresh();
    } catch {
      // fetch() throws on a real network failure (offline, DNS, etc.) —
      // a server 4xx/5xx would have reached the `try` block's res.ok check
      // above instead, so this path really means "no connection right now".
      const fields: Record<string, string> = {};
      formData.forEach((v, k) => {
        if (k !== "applicantId") fields[k] = String(v);
      });
      await queueVerification(applicantId, fields);
      await refreshPendingCount();
      setStatus("queued");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {pendingCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning">
          <span className="flex items-center gap-1.5">
            <WifiOff className="size-3.5" aria-hidden /> {pendingCount} verification{pendingCount > 1 ? "s" : ""} saved
            offline, not yet synced
          </span>
          <button type="button" onClick={sync} className="inline-flex items-center gap-1 font-medium hover:underline">
            <RefreshCw className="size-3.5" aria-hidden /> Sync now
          </button>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="incomeBandVerified" defaultChecked={verification?.incomeBandVerified} className="size-4 rounded border-border accent-accent" />
        Income band verified against evidence
      </label>
      <Select label="Housing condition" name="housingCondition" required defaultValue={verification?.housingCondition ?? ""} placeholder="Select">
        <option value="KUTCHA">Kutcha</option>
        <option value="SEMI_PUCCA">Semi-pucca</option>
        <option value="PUCCA">Pucca</option>
      </Select>
      <Field
        label="Household size (confirmed)"
        type="number"
        name="householdSizeConfirmed"
        min={1}
        max={30}
        required
        defaultValue={verification?.householdSizeConfirmed ?? undefined}
      />
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="photoEvidenceConfirmed" defaultChecked={verification?.photoEvidenceConfirmed} className="size-4 rounded border-border accent-accent" />
        Photo evidence collected during the visit
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="duplicateCheckPassed" defaultChecked className="size-4 rounded border-border accent-accent" />
        No duplicate/returning application found
      </label>
      <TextArea label="Notes (optional)" name="notes" rows={3} defaultValue={verification?.notes ?? ""} />
      <Select label="Decision" name="decision" required placeholder="Select">
        <option value="APPROVED">Approve — move to interview</option>
        <option value="NEEDS_FOLLOW_UP">Needs follow-up visit</option>
        <option value="REJECTED">Reject</option>
      </Select>

      {status === "error" && error && <p className="text-sm text-danger">{error}</p>}
      {status === "queued" && (
        <p className="text-sm text-warning">Saved on this device — it will sync automatically once you&apos;re back online.</p>
      )}
      {status === "saved" && <p className="text-sm text-success">Saved.</p>}

      <Button type="submit" variant="primary" className="w-full" disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : "Save verification"}
      </Button>
    </form>
  );
}
