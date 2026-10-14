import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";

export default async function StaffHome() {
  const session = await requireRole(["STAFF", "COMMITTEE", "VOLUNTEER"]);
  const role = session.user.role;

  const [applicantCounts, studentCounts] = await Promise.all([
    prisma.applicant.groupBy({ by: ["status"], _count: true }),
    prisma.student.groupBy({ by: ["status"], _count: true }),
  ]);

  // Role-scoped querysets — mirrors the permissions table (§4 of the plan):
  // a volunteer only ever sees applicants assigned to them.
  const volunteerQueue =
    role === "VOLUNTEER"
      ? await prisma.applicant.findMany({
          where: { volunteerId: session.user.id, status: { in: ["UNDER_VERIFICATION", "SUBMITTED"] } },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const interviewQueue =
    role === "COMMITTEE"
      ? await prisma.applicant.findMany({
          where: { status: { in: ["INTERVIEW_SCHEDULED", "INTERVIEWED"] } },
          include: { interview: { include: { scores: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const fullPipeline =
    role === "STAFF"
      ? await prisma.applicant.findMany({
          orderBy: { createdAt: "desc" },
          include: { volunteer: true },
          take: 25,
        })
      : [];

  const atRiskStudents =
    role === "STAFF"
      ? await prisma.student.findMany({
          where: { mentorLogs: { some: { isRiskFlag: true, resolvedAt: null } } },
          include: { user: true, mentor: { include: { user: true } }, mentorLogs: { where: { isRiskFlag: true, resolvedAt: null } } },
        })
      : [];

  return (
    <AppShell role={role} name={session.user.name ?? "Staff"} nav={[{ label: "Pipeline", href: "/staff" }]}>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {applicantCounts.map((c) => (
          <div key={c.status} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-2xl font-semibold text-neutral-900">{c._count}</p>
            <p className="mt-1 text-xs text-neutral-500">{c.status.replaceAll("_", " ")}</p>
          </div>
        ))}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {studentCounts.map((c) => (
          <div key={c.status} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <p className="text-2xl font-semibold text-emerald-900">{c._count}</p>
            <p className="mt-1 text-xs text-emerald-700">Students · {c.status}</p>
          </div>
        ))}
      </section>

      {role === "VOLUNTEER" && (
        <section className="mt-8">
          <h3 className="text-sm font-semibold text-neutral-900">My verification queue</h3>
          <Table
            rows={volunteerQueue}
            empty="No applicants assigned to you right now."
            columns={["Name", "District", "Status"]}
            render={(a) => [a.fullName, a.district, <StatusPill key="s" value={a.status} />]}
          />
        </section>
      )}

      {role === "COMMITTEE" && (
        <section className="mt-8">
          <h3 className="text-sm font-semibold text-neutral-900">Interview queue</h3>
          <Table
            rows={interviewQueue}
            empty="No applicants awaiting interview decisions."
            columns={["Name", "District", "Score (avg)", "Status"]}
            render={(a) => {
              const scores = a.interview?.scores ?? [];
              const avg = scores.length
                ? (
                    scores.reduce((s, x) => s + x.academicMerit + x.financialNeed + x.communication + x.intentClarity, 0) /
                    (scores.length * 4)
                  ).toFixed(1)
                : "–";
              return [a.fullName, a.district, avg, <StatusPill key="s" value={a.status} />];
            }}
          />
        </section>
      )}

      {role === "STAFF" && (
        <>
          <section className="mt-8">
            <h3 className="text-sm font-semibold text-neutral-900">Full pipeline (latest 25)</h3>
            <Table
              rows={fullPipeline}
              empty="No applicants yet."
              columns={["Name", "District", "Volunteer", "Status"]}
              render={(a) => [a.fullName, a.district, a.volunteer?.name ?? "Unassigned", <StatusPill key="s" value={a.status} />]}
            />
          </section>

          <section className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-5">
            <h3 className="text-sm font-semibold text-rose-900">
              At-risk students ({atRiskStudents.length})
            </h3>
            <p className="text-xs text-rose-700">
              Status unresolved risk flags, surfaced across every mentor.
            </p>
            {atRiskStudents.length === 0 ? (
              <p className="mt-3 text-sm text-rose-800">No open risk flags right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {atRiskStudents.map((s) => (
                  <li key={s.id} className="text-sm text-rose-900">
                    <span className="font-medium">{s.user.name}</span> · mentor {s.mentor?.user.name ?? "unassigned"} —{" "}
                    {s.mentorLogs.map((l) => l.note).join("; ")}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

function Table<T>({
  rows,
  columns,
  render,
  empty,
}: {
  rows: T[];
  columns: string[];
  render: (row: T) => React.ReactNode[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-neutral-500">{empty}</p>;
  }
  return (
    <table className="mt-3 w-full rounded-xl border border-neutral-200 bg-white text-sm">
      <thead>
        <tr className="border-b border-neutral-100 text-left text-xs uppercase text-neutral-400">
          {columns.map((c) => (
            <th key={c} className="px-4 py-2">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-neutral-50 last:border-0">
            {render(row).map((cell, j) => (
              <td key={j} className="px-4 py-2 text-neutral-700">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
