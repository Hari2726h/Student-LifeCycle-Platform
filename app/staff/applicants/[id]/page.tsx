import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Download, FileWarning } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findPossibleDuplicates } from "@/lib/applicants";
import { getOpenSlots } from "@/lib/interview-slots";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, Select, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListChecks, CalendarPlus } from "lucide-react";
import { submitVerification, scheduleInterview, submitScore, recordDecision } from "./actions";

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

  return (
    <AppShell
      role={role}
      name={session.user.name ?? "Staff"}
      nav={
        role === "COMMITTEE"
          ? [
              { label: "Pipeline", href: "/staff", icon: <ListChecks /> },
              { label: "Interview slots", href: "/staff/interview-slots", icon: <CalendarPlus /> },
            ]
          : [{ label: "Pipeline", href: "/staff", icon: <ListChecks /> }]
      }
    >
      <PageHeader
        eyebrow="Applicant"
        title={applicant.fullName}
        description={`${applicant.district} · ${applicant.courseInterest ?? "No course selected"}`}
        action={<StatusBadge value={applicant.status} />}
      />

      {error && <p className="mb-4 text-sm text-danger">{decodeURIComponent(error)}</p>}

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
