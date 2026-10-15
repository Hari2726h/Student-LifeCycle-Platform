"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { setLanguageAction } from "./actions";

export function LanguageToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Lang) {
    if (next === lang) return;
    startTransition(async () => {
      await setLanguageAction(next);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex rounded-md border border-border bg-surface p-0.5 text-sm">
      {(["en", "ta"] as const).map((code) => (
        <button
          key={code}
          type="button"
          disabled={pending}
          onClick={() => choose(code)}
          className={`rounded px-2.5 py-1 font-medium transition-colors ${
            lang === code ? "bg-accent-soft text-accent-strong" : "text-ink-muted hover:text-ink"
          }`}
        >
          {code === "en" ? "English" : "தமிழ்"}
        </button>
      ))}
    </div>
  );
}
