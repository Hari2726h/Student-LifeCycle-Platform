"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";

export function IssueCredentialButton({ alumniProfileId, fileLabel }: { alumniProfileId: string; fileLabel: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleClick() {
    setStatus("loading");
    try {
      const res = await fetch("/api/credentials/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alumniProfileId }),
      });
      if (!res.ok) throw new Error("issue failed");
      const credential = await res.json();

      const blob = new Blob([JSON.stringify(credential, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `maatram-credential-${fileLabel}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-strong disabled:opacity-50"
      title="Issue a signed, verifiable credential JSON for this alumnus"
    >
      <BadgeCheck className="size-3.5" aria-hidden /> {status === "loading" ? "Issuing…" : status === "error" ? "Failed" : "Issue credential"}
    </button>
  );
}
