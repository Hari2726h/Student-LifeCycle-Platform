"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { BrandMark } from "@/components/brand-mark";
import { requestOtpAction } from "./actions";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { LanguageToggle } from "./language-toggle";

export function PhoneGate({ lang }: { lang: Lang }) {
  const strings = t(lang);
  const router = useRouter();
  const [phase, setPhase] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await requestOtpAction(phone);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPhone(result.phone);
    setDevCode(result.devCode);
    setPhase("code");
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await signIn("phone-otp", { phone, code, redirect: false });
    setPending(false);
    if (result?.error) {
      setError("That code didn't match. Please try again.");
      return;
    }
    router.push("/apply");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandMark className="size-7" />
          <span className="font-display text-sm font-medium text-ink">{strings.appName}</span>
        </div>
        <LanguageToggle lang={lang} />
      </div>
      <h1 className="font-display text-xl font-medium text-ink">{strings.phoneGateTitle}</h1>
      <p className="mt-1 text-sm text-ink-muted">{strings.phoneGateSubtitle}</p>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {phase === "phone" ? (
        <form onSubmit={onRequestCode} className="mt-6 space-y-4">
          <Field
            label={strings.phoneLabel}
            type="tel"
            inputMode="numeric"
            name="phone"
            required
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="submit" variant="primary" className="w-full" loading={pending}>
            {strings.sendCode}
          </Button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="mt-6 space-y-4">
          {devCode && (
            <div className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2.5 text-sm text-accent-strong">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p>{strings.devCodeNotice}</p>
                <p className="mt-1 font-mono text-lg font-semibold tracking-widest">{devCode}</p>
              </div>
            </div>
          )}
          <p className="text-xs text-ink-faint">
            {strings.codeSentTo} +91 {phone}
          </p>
          <Field
            label={strings.codeLabel}
            type="text"
            inputMode="numeric"
            name="code"
            required
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" variant="primary" className="w-full" loading={pending}>
            {strings.verifyAndContinue}
          </Button>
          <button
            type="button"
            onClick={() => {
              setPhase("phone");
              setCode("");
              setDevCode(null);
            }}
            className="w-full text-center text-sm text-ink-muted hover:text-ink"
          >
            {strings.changeNumber}
          </button>
        </form>
      )}
    </div>
  );
}
