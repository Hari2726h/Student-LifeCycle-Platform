import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";

export default async function ApplicantHome() {
  const session = await requireRole(["APPLICANT"]);

  const applicant = await prisma.applicant.findUnique({
    where: { userId: session.user.id },
    include: {
      preferredCollege: true,
      verification: true,
      interview: true,
    },
  });

  return (
    <AppShell role="APPLICANT" name={session.user.name ?? "Applicant"} nav={[]}>
      <h2 className="text-lg font-semibold text-neutral-900">Your application</h2>
      <p className="text-sm text-neutral-500">
        Track every stage of your sponsorship application here.
      </p>

      {!applicant ? (
        <p className="mt-6 text-sm text-neutral-500">No application found yet.</p>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">{applicant.fullName}</p>
                <p className="text-sm text-neutral-500">
                  {applicant.courseInterest} · {applicant.preferredCollege?.name ?? "No college preference set"}
                </p>
              </div>
              <StatusPill value={applicant.status} />
            </div>
          </div>

          <ol className="space-y-3">
            <TimelineStep
              label="Application submitted"
              done
              detail={`${applicant.district} · Board score ${applicant.boardPercentage}%`}
            />
            <TimelineStep
              label="Field verification"
              done={!!applicant.verification}
              detail={
                applicant.verification
                  ? `Decision: ${applicant.verification.decision}`
                  : "A volunteer will visit to verify your details"
              }
            />
            <TimelineStep
              label="Interview"
              done={!!applicant.interview}
              detail={
                applicant.interview
                  ? `Decision: ${applicant.interview.decision}`
                  : "Scheduled after verification is complete"
              }
            />
          </ol>
        </div>
      )}
    </AppShell>
  );
}

function TimelineStep({ label, done, detail }: { label: string; done: boolean; detail: string }) {
  return (
    <li className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done ? "bg-emerald-600 text-white" : "bg-neutral-200 text-neutral-500"
        }`}
      >
        {done ? "✓" : "·"}
      </span>
      <div>
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        <p className="text-xs text-neutral-500">{detail}</p>
      </div>
    </li>
  );
}
