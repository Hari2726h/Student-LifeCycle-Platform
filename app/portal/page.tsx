import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";

export default async function PortalHome() {
  const session = await requireRole(["STUDENT", "ALUMNI"]);

  const student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    include: {
      college: true,
      mentor: { include: { user: true } },
      sponsorship: true,
      certifications: { include: { courseCatalog: true } },
      academicRecords: { orderBy: { semester: "desc" } },
      placement: true,
      alumniProfile: { include: { karpomSessions: true } },
    },
  });

  return (
    <AppShell
      role={session.user.role}
      name={session.user.name ?? "Student"}
      nav={[{ label: "Overview", href: "/portal" }]}
    >
      {!student ? (
        <p className="text-sm text-neutral-500">No student record found.</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">{student.program}</h2>
                <p className="text-sm text-neutral-500">
                  {student.college.name} · Admitted {student.admissionYear}
                </p>
              </div>
              <StatusPill value={student.status} />
            </div>
            {student.mentor && (
              <p className="mt-3 text-sm text-neutral-600">
                Mentor: <span className="font-medium">{student.mentor.user.name}</span>
                {student.mentor.specialty ? ` · ${student.mentor.specialty}` : ""}
              </p>
            )}
          </section>

          {student.sponsorship && (
            <section className="rounded-xl border border-neutral-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-neutral-900">Sponsorship coverage</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-neutral-600 sm:grid-cols-5">
                {[
                  ["Tuition", student.sponsorship.tuitionCovered],
                  ["Hostel", student.sponsorship.hostelCovered],
                  ["Food", student.sponsorship.foodCovered],
                  ["Transport", student.sponsorship.transportCovered],
                  ["Materials", student.sponsorship.materialsCovered],
                ].map(([label, covered]) => (
                  <span key={label as string} className="flex items-center gap-1.5">
                    <span className={covered ? "text-emerald-600" : "text-neutral-300"}>●</span>
                    {label as string}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">Certifications</h3>
            {student.certifications.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">None recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {student.certifications.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-700">
                      {c.name} {c.issuer ? `· ${c.issuer}` : ""}
                    </span>
                    <StatusPill value={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">Academic record</h3>
            {student.academicRecords.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">None recorded yet.</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-neutral-400">
                    <th className="py-1">Semester</th>
                    <th className="py-1">GPA</th>
                    <th className="py-1">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {student.academicRecords.map((r) => (
                    <tr key={r.id} className="border-t border-neutral-100">
                      <td className="py-1.5">{r.semester}</td>
                      <td className="py-1.5">{r.gpa.toFixed(2)}</td>
                      <td className="py-1.5">{r.attendancePercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {student.placement && (
            <section className="rounded-xl border border-neutral-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-neutral-900">Placement</h3>
              <p className="mt-2 text-sm text-neutral-700">
                {student.placement.role} at <span className="font-medium">{student.placement.company}</span>
                {student.placement.packageInrLakhs ? ` · ₹${student.placement.packageInrLakhs}L` : ""}
              </p>
            </section>
          )}

          {student.alumniProfile && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
              <h3 className="text-sm font-semibold text-emerald-900">Giving back — Karpom Karpippom</h3>
              <p className="mt-1 text-xs text-emerald-700">
                Mentoring opt-in: {student.alumniProfile.mentoringOptIn ? "Yes" : "No"}
              </p>
              {student.alumniProfile.karpomSessions.length === 0 ? (
                <p className="mt-2 text-sm text-emerald-800">No tutoring sessions logged yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {student.alumniProfile.karpomSessions.map((s) => (
                    <li key={s.id} className="text-sm text-emerald-900">
                      {s.subject} — {s.juniorName} ({s.sessionDate.toLocaleDateString()})
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
