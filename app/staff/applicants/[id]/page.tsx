import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Download, FileWarning, History } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { findPossibleDuplicates } from "@/lib/applicants";
import { getOpenSlots } from "@/lib/interview-slots";
import { suggestMentors } from "@/lib/mentor-matching";
import { computeDeservingness } from "@/lib/deservingness";
import { getStaffNav } from "@/lib/staff-nav";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, Select, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";
import { submitVerification, scheduleInterview, submitScore, recordDecision, onboardStudent } from "./actions";

const VERIFIED_OR_LATER = [
  "VERIFIED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEWED",
  "SHORTLISTED",
  "ACCEPTED",
  "REJECTED",
  "WAITLISTED",
];

export default async function ApplicantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !["STAFF", "COMMITTEE", "VOLUNTEER"].includes(session.user.role)) {
    redirect("/login");
  }
  const { id } = await params;
  const { error } = await searchParams;
  const role = session.user.role;

  const applicant = await prisma.applicant.findUnique({
    where: { id },
    include: {
      preferredCollege: true,
      volunteer: true,
      sensitiveInfo: true,
      documents: true,
      verification: true,
      interview: { include: { scores: { include: { panelist: true } } } },
      student: true,
    },
  });
  if (!applicant) notFound();

  const isAssignedVolunteer = role === "VOLUNTEER" && applicant.volunteerId === session.user.id;
  if (role === "VOLUNTEER" && !isAssignedVolunteer) {
    redirect("/staff?error=Not+assigned+to+you");
  }

  const canViewSensitive = role === "STAFF" || role === "COMMITTEE" || isAssignedVolunteer;
  const duplicates = canViewSensitive ? await findPossibleDuplicates(applicant.id) : [];

  const showInterviewSection = VERIFIED_OR_LATER.includes(applicant.status);
  const myScore = applicant.interview?.scores.find((s) => s.panelistId === session.user.id);

  const openSlots =
    role === "COMMITTEE" && showInterviewSection && !applicant.interview ? await getOpenSlots() : [];

  const deservingness =
    (role === "STAFF" || role === "COMMITTEE") && applicant.sensitiveInfo
      ? computeDeservingness({
          boardPercentage: applicant.boardPercentage,
          gender: applicant.gender,
          familySituation: applicant.sensitiveInfo.familySituation,
          annualIncomeInr: applicant.sensitiveInfo.annualIncomeInr,
          householdSize: applicant.sensitiveInfo.householdSize,
          interviewScores: applicant.interview?.scores ?? [],
        })
      : null;

  const canOnboard = role === "STAFF" && applicant.status === "ACCEPTED" && !applicant.student;
  const [onboardColleges, mentorSuggestions] = canOnboard
    ? await Promise.all([prisma.college.findMany({ orderBy: { name: "asc" } }), suggestMentors(applicant.id)])
    : [[], []];

  const canViewHistory = role === "STAFF" || role === "COMMITTEE";
  const history = canViewHistory
    ? await prisma.event.findMany({
        where: {
          OR: [
            { aggregateType: "Applicant", aggregateId: applicant.id },
            ...(applicant.student ? [{ aggregateType: "Student", aggregateId: applicant.student.id }] : []),
          ],
        },
        orderBy: { sequence: "asc" },
      })
    : [];

  const nav = await getStaffNav(role, session.user.id);

  return (
    <AppShell role={role} name={session.user.name ?? "Staff"} nav={nav}>
      <PageHeader
        eyebrow="Applicant"
        title={applicant.fullName}
        description={`${applicant.district} · ${applicant.courseInterest ?? "No course selected"}`}
        action={<StatusBadge value={applicant.status} />}
      />

      {error && <p className="mb-4 text-sm text-danger">{decodeURIComponent(error)}</p>}

      {applicant.student && (
        <Card className="mb-5 border-success/30 bg-success-soft/40">
          <CardBody className="flex items-center gap-3">
            <GraduationCap className="size-4 shrink-0 text-success" aria-hidden />
            <p className="text-sm text-ink">
              Onboarded as a student — <StatusBadge value={applicant.student.status} />
            </p>
          </CardBody>
        </Card>
      )}

      {canOnboard && (
        <OnboardingSection
          applicantId={applicant.id}
          defaultCollegeId={applicant.preferredCollegeId}
          defaultProgram={applicant.courseInterest}
          colleges={onboardColleges}
          suggestions={mentorSuggestions}
        />
      )}

      {duplicates.length > 0 && (
        <Card className="mb-5 border-warning/30 bg-warning-soft/50">
          <CardBody className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="text-sm font-medium text-warning">Possible duplicate application</p>
              <ul className="mt-1 space-y-0.5 text-sm text-ink">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    {d.fullName} · {d.district} · <StatusBadge value={d.status} />
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader eyebrow="Overview" title="Personal & academic" />
            <CardBody className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row label="Phone" value={applicant.phone} />
              <Row label="Email" value={applicant.email ?? "—"} />
              <Row label="Date of birth" value={applicant.dob.toLocaleDateString()} />
              <Row label="Gender" value={applicant.gender} />
              <Row label="Board %" value={applicant.boardPercentage ? `${applicant.boardPercentage}%` : "—"} />
              <Row label="Preferred college" value={applicant.preferredCollege?.name ?? "No preference"} />
              <Row label="Assigned volunteer" value={applicant.volunteer?.name ?? "Unassigned"} />
            </CardBody>
          </Card>

          {canViewSensitive && (
            <Card>
              <CardHeader eyebrow="Sensitive" title="Family & income" />
              <CardBody className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {applicant.sensitiveInfo ? (
                  <>
                    <Row label="Address" value={`${applicant.sensitiveInfo.addressLine1}, ${applicant.sensitiveInfo.pincode}`} />
                    <Row label="Guardian" value={`${applicant.sensitiveInfo.guardianName} · ${applicant.sensitiveInfo.guardianPhone}`} />
                    <Row label="Annual income" value={applicant.sensitiveInfo.annualIncomeInr ? `₹${applicant.sensitiveInfo.annualIncomeInr}` : "—"} />
                    <Row label="Household size" value={String(applicant.sensitiveInfo.householdSize ?? "—")} />
                    <Row label="Family situation" value={applicant.sensitiveInfo.familySituation.replaceAll("_", " ")} />
                  </>
                ) : (
                  <p className="col-span-2 text-ink-faint">Not yet submitted.</p>
                )}
              </CardBody>
            </Card>
          )}

          {deservingness && (
            <DeservingnessCard result={deservingness} />
          )}

          {canViewSensitive && (
            <Card>
              <CardHeader eyebrow="Evidence" title="Documents" />
              <CardBody>
                {applicant.documents.length === 0 ? (
                  <p className="text-sm text-ink-faint">No documents uploaded yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {applicant.documents.map((d) => (
                      <li key={d.id} className="flex items-center justify-between text-sm">
                        <span className="text-ink">{d.kind.replaceAll("_", " ")} — {d.fileName}</span>
                        <a href={`/api/documents/${d.id}`} className="flex items-center gap-1 text-accent hover:text-accent-strong">
                          <Download className="size-3.5" aria-hidden /> View
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}

          {showInterviewSection && (
            <InterviewSection
              applicantId={applicant.id}
              interview={applicant.interview}
              role={role}
              myScore={myScore}
              openSlots={openSlots}
            />
          )}

          {canViewHistory && <HistorySection events={history} />}
        </div>

        <div className="space-y-5">
          <VerificationSection
            applicantId={applicant.id}
            verification={applicant.verification}
            canAct={isAssignedVolunteer && ["SUBMITTED", "UNDER_VERIFICATION"].includes(applicant.status)}
          />
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-span-1">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function VerificationSection({
  applicantId,
  verification,
  canAct,
}: {
  applicantId: string;
  verification: {
    decision: string;
    incomeBandVerified: boolean;
    housingCondition: string | null;
    householdSizeConfirmed: number | null;
    photoEvidenceConfirmed: boolean;
    notes: string | null;
  } | null;
  canAct: boolean;
}) {
  if (canAct) {
    return (
      <Card>
        <CardHeader eyebrow="Field visit" title="Verification checklist" />
        <CardBody>
          <form action={submitVerification.bind(null, applicantId)} className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="incomeBandVerified" defaultChecked={verification?.incomeBandVerified} className="size-4 rounded border-border accent-accent" />
              Income band verified against evidence
            </label>
            <Select label="Housing condition" name="housingCondition" required defaultValue={verification?.housingCondition ?? ""} placeholder="Select">
              <option value="KUTCHA">Kutcha</option>
              <option value="SEMI_PUCCA">Semi-pucca</option>
              <option value="PUCCA">Pucca</option>
            </Select>
            <Field
              label="Household size (confirmed)"
              type="number"
              name="householdSizeConfirmed"
              min={1}
              max={30}
              required
              defaultValue={verification?.householdSizeConfirmed ?? undefined}
            />
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="photoEvidenceConfirmed" defaultChecked={verification?.photoEvidenceConfirmed} className="size-4 rounded border-border accent-accent" />
              Photo evidence collected during the visit
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="duplicateCheckPassed" defaultChecked className="size-4 rounded border-border accent-accent" />
              No duplicate/returning application found
            </label>
            <TextArea label="Notes (optional)" name="notes" rows={3} defaultValue={verification?.notes ?? ""} />
            <Select label="Decision" name="decision" required placeholder="Select">
              <option value="APPROVED">Approve — move to interview</option>
              <option value="NEEDS_FOLLOW_UP">Needs follow-up visit</option>
              <option value="REJECTED">Reject</option>
            </Select>
            <Button type="submit" variant="primary" className="w-full">
              Save verification
            </Button>
          </form>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader eyebrow="Field visit" title="Verification" />
      <CardBody>
        {!verification ? (
          <p className="text-sm text-ink-faint">Not yet verified.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <Badge tone={verification.decision === "APPROVED" ? "success" : verification.decision === "REJECTED" ? "danger" : "warning"}>
              {verification.decision.replaceAll("_", " ")}
            </Badge>
            <Row label="Housing" value={verification.housingCondition?.replaceAll("_", " ") ?? "—"} />
            <Row label="Household size" value={String(verification.householdSizeConfirmed ?? "—")} />
            <Row label="Photo evidence" value={verification.photoEvidenceConfirmed ? "Collected" : "Not collected"} />
            {verification.notes && <p className="text-ink-muted">{verification.notes}</p>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function InterviewSection({
  applicantId,
  interview,
  role,
  myScore,
  openSlots,
}: {
  applicantId: string;
  interview: {
    id: string;
    scheduledAt: Date | null;
    location: string | null;
    decision: string;
    decidedAt: Date | null;
    scores: { id: string; panelistId: string; academicMerit: number; financialNeed: number; communication: number; intentClarity: number; panelist: { name: string } }[];
  } | null;
  role: string;
  myScore?: { academicMerit: number; financialNeed: number; communication: number; intentClarity: number };
  openSlots: { id: string; scheduledAt: Date; location: string; capacity: number; _count: { interviews: number } }[];
}) {
  if (!interview) {
    if (role !== "COMMITTEE") {
      return (
        <Card>
          <CardHeader eyebrow="Selection" title="Interview" />
          <CardBody>
            <p className="text-sm text-ink-faint">Not yet scheduled.</p>
          </CardBody>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader eyebrow="Selection" title="Schedule interview" description="Picks from the panel's declared availability." />
        <CardBody>
          {openSlots.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No open slots. <a href="/staff/interview-slots" className="text-accent hover:text-accent-strong">Declare one</a> first.
            </p>
          ) : (
            <form action={scheduleInterview.bind(null, applicantId)} className="space-y-4">
              <Select label="Available slot" name="slotId" required placeholder="Select a slot">
                {openSlots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.scheduledAt.toLocaleString()} · {s.location} ({s.capacity - s._count.interviews} open)
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="primary" className="w-full">
                Schedule
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    );
  }

  const avgFor = (s: (typeof interview.scores)[number]) =>
    ((s.academicMerit + s.financialNeed + s.communication + s.intentClarity) / 4).toFixed(1);

  return (
    <Card>
      <CardHeader
        eyebrow="Selection"
        title="Interview"
        description={interview.scheduledAt ? `${interview.scheduledAt.toLocaleString()} · ${interview.location}` : undefined}
      />
      <CardBody className="space-y-5">
        {interview.scores.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {interview.scores.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span className="text-ink-muted">{s.panelist.name}</span>
                <span className="font-mono tabular-nums text-ink">{avgFor(s)}</span>
              </li>
            ))}
          </ul>
        )}

        {interview.decision === "PENDING" ? (
          role === "COMMITTEE" ? (
            <>
              <form action={submitScore.bind(null, applicantId)} className="space-y-3 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">
                  {myScore ? "Update your scorecard" : "Your scorecard"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Academic merit (1-10)" type="number" name="academicMerit" min={1} max={10} required defaultValue={myScore?.academicMerit} />
                  <Field label="Financial need (1-10)" type="number" name="financialNeed" min={1} max={10} required defaultValue={myScore?.financialNeed} />
                  <Field label="Communication (1-10)" type="number" name="communication" min={1} max={10} required defaultValue={myScore?.communication} />
                  <Field label="Intent clarity (1-10)" type="number" name="intentClarity" min={1} max={10} required defaultValue={myScore?.intentClarity} />
                </div>
                <Button type="submit" variant="secondary" className="w-full">
                  {myScore ? "Update score" : "Submit score"}
                </Button>
              </form>

              {interview.scores.length > 0 && (
                <div className="flex gap-2 border-t border-border pt-4">
                  <form action={recordDecision.bind(null, applicantId)} className="flex-1">
                    <input type="hidden" name="decision" value="ACCEPTED" />
                    <Button type="submit" variant="primary" className="w-full">
                      Accept
                    </Button>
                  </form>
                  <form action={recordDecision.bind(null, applicantId)} className="flex-1">
                    <input type="hidden" name="decision" value="WAITLISTED" />
                    <Button type="submit" variant="secondary" className="w-full">
                      Waitlist
                    </Button>
                  </form>
                  <form action={recordDecision.bind(null, applicantId)} className="flex-1">
                    <input type="hidden" name="decision" value="REJECTED" />
                    <Button type="submit" variant="danger" className="w-full">
                      Reject
                    </Button>
                  </form>
                </div>
              )}
            </>
          ) : (
            <p className="border-t border-border pt-4 text-sm text-ink-faint">Awaiting committee decision.</p>
          )
        ) : (
          <div className="flex items-center gap-2 border-t border-border pt-4">
            <FileWarning className="size-4 text-ink-faint" aria-hidden />
            <StatusBadge value={interview.decision} />
            <span className="text-xs text-ink-faint">
              {interview.decidedAt && `Decided ${interview.decidedAt.toLocaleDateString()}`} — final
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function OnboardingSection({
  applicantId,
  defaultCollegeId,
  defaultProgram,
  colleges,
  suggestions,
}: {
  applicantId: string;
  defaultCollegeId: string | null;
  defaultProgram: string | null;
  colleges: { id: string; name: string; district: string }[];
  suggestions: Awaited<ReturnType<typeof suggestMentors>>;
}) {
  return (
    <Card className="mb-5">
      <CardHeader
        eyebrow="Onboarding"
        title="Create the student record"
        description="Accepted — map them to a college/program, pick a mentor, and confirm sponsorship coverage."
      />
      <CardBody>
        <form action={onboardStudent.bind(null, applicantId)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Select label="College" name="collegeId" required defaultValue={defaultCollegeId ?? ""} placeholder="Select college">
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.district}
                </option>
              ))}
            </Select>
            <Field label="Program" name="program" required defaultValue={defaultProgram ?? ""} />
          </div>
          <Field label="Admission year" type="number" name="admissionYear" min={2000} max={2100} required defaultValue={new Date().getFullYear()} />

          <div>
            <p className="text-sm font-medium text-ink">Mentor — ranked suggestions</p>
            <p className="text-xs text-ink-faint">Scored on specialty overlap, district, and current caseload. Pick one.</p>
            {suggestions.length === 0 ? (
              <p className="mt-2 text-sm text-ink-faint">No mentors with spare capacity right now.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {suggestions.map((s, i) => (
                  <li key={s.mentorId}>
                    <label className="flex items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                      <input type="radio" name="mentorId" value={s.mentorId} required defaultChecked={i === 0} className="mt-1 accent-accent" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium text-ink">
                          {s.name}
                          <Badge tone="neutral">{s.type === "ALUMNI" ? "Alumni mentor" : "Staff mentor"}</Badge>
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          {s.reasons.length > 0 ? s.reasons.join(" · ") : "No strong signal — general fit"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-ink">Sponsorship coverage</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["tuitionCovered", "Tuition"],
                ["hostelCovered", "Hostel"],
                ["foodCovered", "Food"],
                ["transportCovered", "Transport"],
                ["materialsCovered", "Materials"],
              ].map(([name, label]) => (
                <label key={name} className="flex items-center gap-1.5 text-sm text-ink">
                  <input type="checkbox" name={name} defaultChecked className="size-4 rounded border-border accent-accent" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full" disabled={suggestions.length === 0}>
            Onboard student
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

/** Reads straight off the Event log (lib/events.ts) rather than a
 * separate audit table — the log is already the source of truth, and this
 * is just a projection of it filtered to one applicant/student pair. */
function HistorySection({
  events,
}: {
  events: { id: string; sequence: number; type: string; payload: Prisma.JsonValue; occurredAt: Date }[];
}) {
  return (
    <Card>
      <CardHeader eyebrow="Audit trail" title="History" description="Every status change, in order, with who did it and why." />
      <CardBody>
        {events.length === 0 ? (
          <p className="text-sm text-ink-faint">No recorded events yet.</p>
        ) : (
          <ol className="space-y-4 border-l border-border pl-4">
            {events.map((e) => {
              const p = (e.payload ?? {}) as Record<string, unknown>;
              return (
                <li key={e.id} className="relative">
                  <History className="absolute -left-[22px] top-0.5 size-3.5 text-ink-faint" aria-hidden />
                  <p className="text-sm text-ink">{describeEvent(e.type, p)}</p>
                  {typeof p.reason === "string" && p.reason && (
                    <p className="mt-0.5 text-xs text-ink-muted">Reason: {p.reason}</p>
                  )}
                  <p className="mt-0.5 text-xs text-ink-faint">{e.occurredAt.toLocaleString()}</p>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function describeEvent(type: string, p: Record<string, unknown>): string {
  if (type === "APPLICANT_STATUS_CHANGED") {
    const action = p.action ? ` (${String(p.action).replaceAll("_", " ").toLowerCase()})` : "";
    const bulk = p.bulk ? " · bulk action" : "";
    return `Status: ${p.fromStatus ?? "—"} → ${p.toStatus}${action}${bulk}`;
  }
  if (type === "STUDENT_ONBOARDED") {
    return "Onboarded as a student";
  }
  if (type === "MENTOR_LOG_CREATED") {
    return "Mentor check-in logged";
  }
  if (type === "RISK_FLAG_LOGGED") {
    return "Flagged for follow-up during mentor check-in";
  }
  return type.replaceAll("_", " ").toLowerCase();
}

const TIER_TONE = {
  HIGH_PRIORITY: "success",
  STANDARD: "neutral",
  REVIEW_RECOMMENDED: "warning",
} as const;

const TIER_LABEL = {
  HIGH_PRIORITY: "High priority",
  STANDARD: "Standard",
  REVIEW_RECOMMENDED: "Review recommended",
} as const;

/** Admission-time only — this never runs again once a student is
 * enrolled, and it never recommends rejection. It's one input into the
 * committee's decision, not a replacement for it. */
function DeservingnessCard({ result }: { result: ReturnType<typeof computeDeservingness> }) {
  return (
    <Card className="border-accent/30 bg-accent-soft/30">
      <CardHeader
        eyebrow="Admission-time · advisory only"
        title="Deservingness assessment"
        description="Rule-based and fully explainable — scored from the application data above, never from anything that happens after enrollment."
        action={<Badge tone={TIER_TONE[result.tier]}>{TIER_LABEL[result.tier]}</Badge>}
      />
      <CardBody>
        <p className="font-mono text-2xl font-medium tabular-nums text-ink">{result.score}<span className="text-sm text-ink-faint">/100</span></p>
        {result.reasons.length === 0 ? (
          <p className="mt-2 text-sm text-ink-faint">No contributing factors yet — more application data will refine this.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {result.reasons.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-ink-muted">{r.factor}</span>
                <span className={`font-mono tabular-nums ${r.weight > 0 ? "text-success" : "text-danger"}`}>
                  {r.weight > 0 ? "+" : ""}
                  {r.weight}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
