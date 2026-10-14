import { FileText, Check } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ApplicantHome() {
  const session = await requireRole(["APPLICANT"]);

  const applicant = await prisma.applicant.findUnique({
    where: { userId: session.user.id },
    include: { preferredCollege: true, verification: true, interview: true },
  });

  return (
    <AppShell
      role="APPLICANT"
      name={session.user.name ?? "Applicant"}
      nav={[{ label: "Application status", href: "/applicant", icon: <FileText /> }]}
    >
      <PageHeader
        eyebrow="Application"
        title={applicant ? applicant.fullName : "Your application"}
        description="Track every stage of your sponsorship application here."
      />

      {!applicant ? (
        <EmptyState icon={FileText} title="No application found" description="We couldn't find an application linked to your account." />
      ) : (
        <div className="space-y-6">
          <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-ink-muted">
                {applicant.courseInterest} · {applicant.preferredCollege?.name ?? "No college preference set"}
              </p>
              <p className="mt-0.5 text-xs text-ink-faint">
                {applicant.district} · Board score {applicant.boardPercentage}%
              </p>
            </div>
            <StatusBadge value={applicant.status} />
          </Card>

          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Progress</p>
            <ol className="mt-4 space-y-0">
              <TimelineStep
                label="Application submitted"
                done
                last={false}
                detail="Received and on file"
              />
              <TimelineStep
                label="Field verification"
                done={!!applicant.verification}
                last={false}
                detail={
                  applicant.verification
                    ? `Decision: ${applicant.verification.decision.replaceAll("_", " ")}`
                    : "A volunteer will visit to verify your details"
                }
              />
              <TimelineStep
                label="Interview"
                done={!!applicant.interview}
                last
                detail={
                  applicant.interview
                    ? `Decision: ${applicant.interview.decision.replaceAll("_", " ")}`
                    : "Scheduled after verification is complete"
                }
              />
            </ol>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function TimelineStep({
  label,
  done,
  detail,
  last,
}: {
  label: string;
  done: boolean;
  detail: string;
  last: boolean;
}) {
  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
            done ? "bg-accent text-accent-contrast" : "border-2 border-border bg-surface text-ink-faint"
          }`}
        >
          {done && <Check className="size-3" strokeWidth={3} aria-hidden />}
        </span>
        {!last && <span className={`w-px flex-1 ${done ? "bg-accent/40" : "bg-border"}`} style={{ minHeight: 28 }} />}
      </div>
      <div className="pb-7">
        <p className={`text-sm font-medium ${done ? "text-ink" : "text-ink-muted"}`}>{label}</p>
        <p className="mt-0.5 text-xs text-ink-faint">{detail}</p>
      </div>
    </li>
  );
}
