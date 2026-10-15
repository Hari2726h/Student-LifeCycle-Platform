import Link from "next/link";
import { Check } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "./language-toggle";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { WizardStep } from "@/lib/wizard";

const STEP_KEYS = ["stepPersonal", "stepAcademic", "stepFamily", "stepDocuments", "stepReview"] as const;

export function WizardShell({
  lang,
  step,
  maxStep,
  children,
}: {
  lang: Lang;
  step: WizardStep;
  maxStep: WizardStep;
  children: React.ReactNode;
}) {
  const strings = t(lang);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandMark className="size-7" />
          <span className="font-display text-sm font-medium text-ink">{strings.appName}</span>
        </div>
        <LanguageToggle lang={lang} />
      </div>

      <ol className="mt-8 flex items-center gap-1.5">
        {STEP_KEYS.map((key, i) => {
          const n = (i + 1) as WizardStep;
          const done = n < step;
          const current = n === step;
          const reachable = n <= maxStep;
          const label = strings[key];
          const circle = (
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                done
                  ? "bg-accent text-accent-contrast"
                  : current
                    ? "border-2 border-accent text-accent-strong"
                    : "border border-border text-ink-faint"
              }`}
            >
              {done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : n}
            </span>
          );
          return (
            <li key={key} className="flex flex-1 items-center gap-1.5 last:flex-initial">
              {reachable ? (
                <Link href={`/apply?step=${n}`} className="flex items-center gap-1.5" title={label}>
                  {circle}
                </Link>
              ) : (
                circle
              )}
              {i < STEP_KEYS.length - 1 && (
                <span className={`h-px flex-1 ${done ? "bg-accent/50" : "bg-border"}`} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs font-medium uppercase tracking-[0.06em] text-ink-faint">
        {strings[STEP_KEYS[step - 1]]}
      </p>

      <div className="mt-6 animate-fade-up rounded-lg border border-border bg-surface p-6">{children}</div>
    </div>
  );
}
