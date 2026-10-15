import { CheckCircle2 } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function SubmittedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12 text-center">
      <div className="max-w-sm">
        <BrandMark className="mx-auto size-8" />
        <div className="mx-auto mt-6 flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-xl font-medium text-ink">Application submitted</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          A Maatram field volunteer has been assigned and will visit to verify your details. You can check your
          status anytime by returning to this page and signing in with your phone number.
        </p>
      </div>
    </div>
  );
}
