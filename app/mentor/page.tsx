import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";

export default async function MentorHome() {
  const session = await requireRole(["MENTOR"]);

  const mentor = await prisma.mentor.findUnique({
    where: { userId: session.user.id },
    include: {
      mentees: {
        include: {
          user: true,
          college: true,
          mentorLogs: { orderBy: { createdAt: "desc" }, take: 3 },
        },
      },
    },
  });

  const openRiskFlags =
    mentor?.mentees.flatMap((m) => m.mentorLogs.filter((l) => l.isRiskFlag && !l.resolvedAt).map((l) => ({ student: m, log: l }))) ?? [];

  return (
    <AppShell
      role="MENTOR"
      name={session.user.name ?? "Mentor"}
      nav={[{ label: "My mentees", href: "/mentor" }]}
    >
      <h2 className="text-lg font-semibold text-neutral-900">My mentees</h2>
      <p className="text-sm text-neutral-500">
        {mentor?.mentees.length ?? 0} of {mentor?.maxLoad ?? "–"} capacity · {mentor?.specialty}
      </p>

      {openRiskFlags.length > 0 && (
        <section className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-5">
          <h3 className="text-sm font-semibold text-rose-900">
            Open risk flags ({openRiskFlags.length})
          </h3>
          <ul className="mt-3 space-y-2">
            {openRiskFlags.map(({ student, log }) => (
              <li key={log.id} className="text-sm text-rose-900">
                <span className="font-medium">{student.user.name}</span> — {log.category.toLowerCase()}:{" "}
                {log.note}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 space-y-3">
        {mentor?.mentees.map((m) => (
          <div key={m.id} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">{m.user.name}</p>
                <p className="text-sm text-neutral-500">
                  {m.program} · {m.college.name}
                </p>
              </div>
              <StatusPill value={m.status} />
            </div>
            {m.mentorLogs.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
                {m.mentorLogs.map((log) => (
                  <li key={log.id} className="flex items-center gap-2 text-xs text-neutral-600">
                    {log.isRiskFlag && <StatusPill value={log.severity} />}
                    <span>{log.note}</span>
                  </li>
                ))}
              </ul>
            )}
            <form action={addCheckIn} className="mt-3 flex gap-2 border-t border-neutral-100 pt-3">
              <input type="hidden" name="studentId" value={m.id} />
              <input type="hidden" name="mentorId" value={mentor.id} />
              <input
                name="note"
                placeholder="Add a check-in note…"
                className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs"
              />
              <button className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800">
                Log
              </button>
            </form>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

async function addCheckIn(formData: FormData) {
  "use server";
  const studentId = String(formData.get("studentId"));
  const mentorId = String(formData.get("mentorId"));
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  await prisma.mentorLog.create({
    data: {
      studentId,
      mentorId,
      category: "OTHER",
      severity: "LOW",
      note,
      isRiskFlag: false,
    },
  });

  revalidatePath("/mentor");
}
