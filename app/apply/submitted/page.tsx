import { cookies } from "next/headers";
import { CheckCircle2 } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "../language-toggle";
import { LANG_COOKIE, t, type Lang } from "@/lib/i18n";

export default async function SubmittedPage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? "en";
  const strings = t(lang);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12 text-center">
      <div className="max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark className="size-7" />
            <span className="font-display text-sm font-medium text-ink">{strings.appName}</span>
          </div>
          <LanguageToggle lang={lang} />
        </div>
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-xl font-medium text-ink">{strings.submittedTitle}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{strings.submittedBody}</p>
      </div>
    </div>
  );
}
