import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Download, FileWarning, History } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPersonTimeline, describePersonTimelineEvent } from "@/lib/person-timeline";
import type { Event } from "@prisma/client";
import { findPossibleDuplicates } from "@/lib/applicants";
import { getOpenSlots } from "@/lib/interview-slots";
import { suggestMentors } from "@/lib/mentor-matching";
import { computeDeservingness, DESERVINGNESS_TIER_TONE, DESERVINGNESS_TIER_LABEL } from "@/lib/deservingness";
import { getStaffNav } from "@/lib/staff-nav";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, Select, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";
import { scheduleInterview, submitScore, recordDecision, scheduleOfflineMeeting, recordOfflineMeetingDecision, addApplicantRemark, onboardStudent } from "./actions";
import { VerificationForm } from "./verification-form";
import { TimeTravelViewer } from "@/components/time-travel-viewer";
import { AdvisorySummary } from "@/components/advisory-summary";
import { JourneySummary } from "@/components/journey-summary";

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
      offlineMeeting: { include: { coordinator: true } },
      identityInfo: { select: { aadhaarLast4: true } },
      callVerifications: { orderBy: { calledAt: "desc" }, take: 10, include: { volunteer: { select: { name: true } } } },
      physicalVerificationReports: { orderBy: { createdAt: "desc" }, take: 10, include: { volunteer: { select: { name: true } } } },
      student: true,
    },
  });
  if (!applicant) notFound();
  const academicDetails = applicant.academicDetails && typeof applicant.academicDetails === "object" && !Array.isArray(applicant.academicDetails)
    ? applicant.academicDetails as Record<string, unknown>
    : null;
  const familyDetails = applicant.sensitiveInfo?.familyDetails && typeof applicant.sensitiveInfo.familyDetails === "object" && !Array.isArray(applicant.sensitiveInfo.familyDetails)
    ? applicant.sensitiveInfo.familyDetails as Record<string, unknown>
    : null;

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
  const history = canViewHistory ? await getPersonTimeline(applicant.id) : [];

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
              <Row label="Community" value={applicant.community ?? "Not provided"} />
              <Row label="Aadhaar" value={applicant.identityInfo ? `XXXX-XXXX-${applicant.identityInfo.aadhaarLast4}` : "Not provided"} />
              <Row label="Board %" value={applicant.boardPercentage != null ? `${applicant.boardPercentage}%` : "—"} />
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
                    <Row label="Annual income" value={applicant.sensitiveInfo.annualIncomeInr != null ? `₹${applicant.sensitiveInfo.annualIncomeInr}` : "—"} />
                    <Row label="Household size" value={String(applicant.sensitiveInfo.householdSize ?? "—")} />
                    <Row label="Family situation" value={applicant.sensitiveInfo.familySituation.replaceAll("_", " ")} />
                    <Row label="Parents" value={`${String(familyDetails?.fatherName ?? "Not provided")} · ${String(familyDetails?.motherName ?? "Not provided")}`} />
                    <Row label="Parent occupations" value={`${String(familyDetails?.fatherOccupation || "Not provided")} · ${String(familyDetails?.motherOccupation || "Not provided")}`} />
                    <Row label="Parents' contact" value={String(familyDetails?.parentsContactNumber ?? "Not provided")} />
                    <Row label="House ownership" value={String(familyDetails?.houseOwnership ?? "Not provided")} />
                    <Row label="State" value={String(familyDetails?.state ?? "Not provided")} />
                    {Array.isArray(familyDetails?.siblings) && <Row label="Siblings" value={familyDetails.siblings.map((item) => `${String((item as Record<string, unknown>).name ?? "Sibling")} · age ${String((item as Record<string, unknown>).age ?? "—")} · ${String((item as Record<string, unknown>).qualification ?? "—")}${(item as Record<string, unknown>).studyingThroughMaatram === "YES" ? " · Maatram" : ""}`).join("; ") || "None listed"} />}
                    <Row label="TN counselling" value={String(familyDetails?.tamilNaduCounselling ?? "Not provided")} />
                    <Row label="First generation" value={String(familyDetails?.firstGeneration ?? "Not provided")} />
                    <Row label="7.5% reservation" value={String(familyDetails?.governmentSchoolReservation ?? "Not provided")} />
                    <Row label="Working" value={String(familyDetails?.currentlyWorking ?? "Not provided")} />
                    <Row label="How they heard about Maatram" value={String(familyDetails?.howHeardAbout ?? "Not provided")} />
                    {typeof familyDetails?.additionalInformation === "string" && familyDetails.additionalInformation && <Row label="Additional information" value={familyDetails.additionalInformation} />}
                  </>
                ) : (
                  <p className="col-span-2 text-ink-faint">Not yet submitted.</p>
                )}
              </CardBody>
            </Card>
          )}

          {canViewSensitive && academicDetails && (
            <Card>
              <CardHeader eyebrow="Education" title="School records" />
              <CardBody className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Row label="10th school" value={`${String(academicDetails.school10Name ?? "—")} · ${String(academicDetails.school10Year ?? "—")}`} />
                <Row label="10th marks" value={String(academicDetails.school10Marks ?? "—")} />
                <Row label="11th school" value={String(academicDetails.school11Name ?? "—")} />
                <Row label="11th marks" value={String(academicDetails.school11Marks ?? "—")} />
                <Row label="12th school" value={`${String(academicDetails.school12Name ?? "—")} · ${String(academicDetails.school12Year ?? "—")}`} />
                <Row label="12th marks / cutoff" value={`${String(academicDetails.school12Marks ?? "—")} / ${String(academicDetails.school12CutoffMarks ?? "—")}`} />
                <Row label="Headmaster" value={`${String(academicDetails.headmasterName ?? "—")} · ${String(academicDetails.headmasterPhone ?? "—")}`} />
              </CardBody>
            </Card>
          )}

          {canViewSensitive && (applicant.callVerifications.length > 0 || applicant.physicalVerificationReports.length > 0) && (
            <Card>
              <CardHeader eyebrow="History" title="Verification history" />
              <CardBody className="space-y-4">
                {applicant.callVerifications.map((call) => <div key={call.id} className="border-b border-border pb-3 last:border-0"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">Call attempt {call.attemptNumber} · {call.status.replaceAll("_", " ")}</span><span className="text-xs text-ink-faint">{call.calledAt.toLocaleString()} · {call.volunteer.name}</span></div>{call.comments && <p className="mt-1 text-sm text-ink-muted">{call.comments}</p>}</div>)}
                {applicant.physicalVerificationReports.map((report) => <div key={report.id} className="border-b border-border pb-3 last:border-0"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">Physical visit · {report.decision.replaceAll("_", " ")}</span><span className="text-xs text-ink-faint">{report.visitAt.toLocaleString()} · {report.volunteer.name}</span></div>{report.observations && <p className="mt-1 text-sm text-ink-muted">{report.observations}</p>}</div>)}
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

          {role === "STAFF" && (
            <OfflineMeetingSection applicantId={applicant.id} status={applicant.status} meeting={applicant.offlineMeeting} />
          )}

          {role === "STAFF" && <Card><CardHeader eyebrow="Staff only" title="Internal remark" description="Saved to the append-only applicant history." /><CardBody><form action={addApplicantRemark.bind(null, applicant.id)} className="space-y-3"><input type="hidden" name="idempotencyKey" value={randomUUID()} /><TextArea label="Remark" name="note" rows={3} maxLength={3000} required /><Button type="submit">Save internal remark</Button></form></CardBody></Card>}

          {canViewHistory && <TimeTravelSection events={history} applicantId={applicant.id} />}
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
          <VerificationForm applicantId={applicantId} verification={verification} />
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
    meetingUrl: string | null;
    decision: string;
    decisionReason: string | null;
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
        {interview.meetingUrl && <a href={interview.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex text-sm font-medium text-accent hover:underline">Open online meeting</a>}
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

        {(role === "COMMITTEE" || role === "STAFF") && interview.scores.length > 0 && (
          <AdvisorySummary applicantId={applicantId} />
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
                <form action={recordDecision.bind(null, applicantId)} className="space-y-3 border-t border-border pt-4">
                  <Field label="Rejection reason (required if rejecting)" name="reason" maxLength={1500} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" name="decision" value="SHORTLISTED" variant="primary">Pass to final meeting</Button>
                    <Button type="submit" name="decision" value="WAITLISTED" variant="secondary">Waitlist</Button>
                    <Button type="submit" name="decision" value="REJECTED" variant="danger">Reject</Button>
                  </div>
                </form>
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
            {interview.decisionReason && <span className="text-xs text-ink-muted">Reason: {interview.decisionReason}</span>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function OfflineMeetingSection({
  applicantId,
  status,
  meeting,
}: {
  applicantId: string;
  status: string;
  meeting: {
    id: string;
    scheduledAt: Date | null;
    location: string | null;
    outcome: string;
    attended: boolean | null;
    remarks: string | null;
    decisionReason: string | null;
    coordinator: { name: string } | null;
  } | null;
}) {
  const canSchedule = status === "SHORTLISTED" && (!meeting || ["SCHEDULED", "RESCHEDULED"].includes(meeting.outcome));
  const canDecide = status === "SHORTLISTED" && !!meeting?.scheduledAt && !["SELECTED", "REJECTED"].includes(meeting.outcome);
  return (
    <Card>
      <CardHeader eyebrow="Final selection" title="Offline meeting" description="Staff confirms the final decision after the in-person meeting." />
      <CardBody className="space-y-4">
        {meeting?.scheduledAt ? (
          <div className="rounded-md border border-border bg-surface-sunken/50 p-3 text-sm">
            <p className="font-medium text-ink">{meeting.scheduledAt.toLocaleString()} · {meeting.location}</p>
            <p className="mt-1 text-xs text-ink-faint">Coordinator: {meeting.coordinator?.name ?? "Unassigned"} · Result: {meeting.outcome.replaceAll("_", " ")}</p>
            {meeting.attended !== null && <p className="mt-1 text-xs text-ink-faint">Applicant attendance: {meeting.attended ? "Attended" : "Did not attend"}</p>}
            {meeting.remarks && <p className="mt-2 text-sm text-ink-muted">{meeting.remarks}</p>}
            {meeting.decisionReason && <p className="mt-1 text-sm text-ink-muted">Decision reason: {meeting.decisionReason}</p>}
          </div>
        ) : status === "SHORTLISTED" ? (
          <p className="text-sm text-ink-muted">The applicant passed the online interview and is ready for the final meeting.</p>
        ) : (
          <p className="text-sm text-ink-faint">Available after the applicant passes the online interview.</p>
        )}
        {canSchedule && (
          <form action={scheduleOfflineMeeting.bind(null, applicantId)} className="grid gap-3 sm:grid-cols-2">
            <Field label="Meeting date and time" type="datetime-local" name="scheduledAt" required />
            <Field label="Location" name="location" required defaultValue={meeting?.location ?? ""} />
            <div className="sm:col-span-2"><Button type="submit" variant="secondary">{meeting ? "Update meeting schedule" : "Schedule final meeting"}</Button></div>
          </form>
        )}
        {canDecide && (
          <form action={recordOfflineMeetingDecision.bind(null, applicantId)} className="space-y-3 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="attended" className="size-4 rounded border-border accent-accent" /> Applicant attended</label>
            <Field label="Decision reason (required for rejection)" name="reason" defaultValue={meeting?.decisionReason ?? ""} maxLength={1500} />
            <TextArea label="Core team remarks" name="remarks" rows={3} defaultValue={meeting?.remarks ?? ""} maxLength={3000} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="decision" value="ACCEPTED" variant="primary">Confirm selection</Button>
              <Button type="submit" name="decision" value="REJECTED" variant="danger">Reject after final meeting</Button>
            </div>
          </form>
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

/** Reads straight off the Event log rather than a separate audit table —
 * the log is already the source of truth. Merges events from every stage
 * this person has passed through (lib/person-timeline.ts), so this is
 * their whole journey, not just the applicant part of it. */
function TimeTravelSection({ events, applicantId }: { events: Event[]; applicantId: string }) {
  return (
    <Card>
      <CardHeader
        eyebrow="Time travel"
        title="Watch this record evolve"
        description="Drag the slider — the snapshot below is reconstructed live from the event log, not re-fetched."
      />
      <CardBody className="space-y-4">
        <TimeTravelViewer events={events} />
        {events.length > 0 && (
          <div className="border-t border-border pt-4">
            <JourneySummary applicantId={applicantId} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function HistorySection({ events }: { events: Event[] }) {
  return (
    <Card>
      <CardHeader
        eyebrow="One record, whole journey"
        title="Full timeline"
        description="Every event across application, student life, mentoring, and career — in order, with who did it and why."
      />
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
                  <p className="text-sm text-ink">{describePersonTimelineEvent(e.type, p)}</p>
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
        action={<Badge tone={DESERVINGNESS_TIER_TONE[result.tier]}>{DESERVINGNESS_TIER_LABEL[result.tier]}</Badge>}
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
