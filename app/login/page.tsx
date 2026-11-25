import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { ROLE_HOME } from "@/lib/roles";
import { BrandMark } from "@/components/brand-mark";
import { Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";

const DEMO_ACCOUNTS = [
  { email: "staff@maatram.org", label: "Staff" },
  { email: "committee@maatram.org", label: "Committee" },
  { email: "volunteer@maatram.org", label: "Volunteer" },
  { email: "mentor1@maatram.org", label: "Mentor" },
  { email: "applicant6@example.com", label: "Applicant" },
  { email: "applicant18@example.com", label: "Student" },
  { email: "applicant21@example.com", label: "Alumni" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;

  // middleware.ts never sends an authenticated user here — it only ever
  // bounces a role mismatch to ROLE_HOME, never to /login — so the only
  // way to land here already signed in is navigating here directly (a
  // bookmark, the homepage's "Sign in" button, browser back). Without
  // this, that showed a confusing fresh login form instead of just
  // continuing to the dashboard the user is already in.
  const session = await auth();
  if (session?.user) redirect(ROLE_HOME[session.user.role]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-8" />
          <div>
            <p className="font-display text-sm font-medium leading-tight text-ink">Maatram</p>
            <p className="text-[11px] leading-tight text-ink-faint">Student Lifecycle Platform</p>
          </div>
        </div>

        <h1 className="mt-7 font-display text-xl font-medium text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Continue to your dashboard.</p>

        {params.error && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            Incorrect email or password. Please try again.
          </div>
        )}

        <form action={loginAction} className="mt-6 space-y-4">
          <input type="hidden" name="callbackUrl" value={params.callbackUrl ?? "/"} />
          <Field label="Email" type="email" name="email" required placeholder="you@maatram.org" />
          <Field label="Password" type="password" name="password" required placeholder="••••••••" />
          <Button type="submit" variant="primary" size="md" className="w-full">
            Sign in
          </Button>
        </form>

        <Link
          href="/apply"
          className="mt-4 flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3.5 py-3 text-sm text-ink transition-colors hover:border-accent/40 hover:bg-surface-sunken"
        >
          <span>
            Applying for sponsorship? <span className="text-ink-muted">Sign in with your mobile number instead.</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </Link>

        <div className="mt-8 rounded-md border border-border bg-surface px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
            Demo accounts
          </p>
          <dl className="mt-2 space-y-1 text-xs">
            {DEMO_ACCOUNTS.map((a) => (
              <div key={a.email} className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">{a.label}</dt>
                <dd className="truncate font-mono text-ink">{a.email}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-ink-faint">
            Password for every account: <code className="font-mono text-ink-muted">Passw0rd!</code>
          </p>
        </div>
      </div>
    </div>
  );
}
