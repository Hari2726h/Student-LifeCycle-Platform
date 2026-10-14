import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

const ROLE_HOME: Record<string, string> = {
  APPLICANT: "/applicant",
  VOLUNTEER: "/staff",
  COMMITTEE: "/staff",
  MENTOR: "/mentor",
  STUDENT: "/portal",
  ALUMNI: "/portal",
  STAFF: "/staff",
};

const STAGES = [
  "Application",
  "Verification",
  "Interview & Selection",
  "Onboarding",
  "Development",
  "Placement & Alumni",
];

export default async function Home() {
  const session = await auth();
  if (session?.user?.role) {
    redirect(ROLE_HOME[session.user.role] ?? "/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-2.5 px-6 py-7">
        <BrandMark className="size-8" />
        <span className="font-display text-base font-medium text-ink">Maatram</span>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-24">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
          Maatram Foundation
        </p>
        <h1 className="mt-3 max-w-2xl text-balance font-display text-4xl font-medium leading-[1.1] text-ink sm:text-5xl">
          One record, from application to alumni.
        </h1>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-muted">
          A single pipeline replacing scattered spreadsheets — for applicants,
          field volunteers, mentors, and program staff alike.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/apply" variant="primary" size="md">
            Apply for sponsorship
          </Button>
          <Button href="/login" variant="secondary" size="md">
            Sign in
          </Button>
        </div>

        <ol className="mt-16 flex max-w-3xl flex-wrap gap-x-8 gap-y-4 border-t border-border pt-8">
          {STAGES.map((stage, i) => (
            <li key={stage} className="flex items-center gap-2.5 text-sm text-ink-muted">
              <span className="font-mono text-xs tabular-nums text-ink-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              {stage}
              {i < STAGES.length - 1 && <span className="ml-6 h-px w-6 bg-border" aria-hidden />}
            </li>
          ))}
        </ol>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 pb-8 text-xs text-ink-faint">
        <Link href="https://www.maatramfoundation.com" className="hover:text-ink-muted">
          maatramfoundation.com ↗
        </Link>
      </footer>
    </div>
  );
}
