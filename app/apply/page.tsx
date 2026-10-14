import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function ApplyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md text-center">
        <div className="flex items-center justify-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="font-display text-sm font-medium text-ink">Maatram</span>
        </div>

        <div className="mx-auto mt-8 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
          <ClipboardList className="size-5" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-xl font-medium text-ink">
          Application form — coming in Phase 2
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Phase 1 built the data model, accounts, and dashboards this form will
          write into. The multi-step application wizard — personal, academic,
          family/income, document upload, OTP save-and-resume — is next.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-accent hover:text-accent-strong">
          Sign in instead →
        </Link>
      </div>
    </div>
  );
}
