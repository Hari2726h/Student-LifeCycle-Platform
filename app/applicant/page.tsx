import { FileText, Check, Bell, CalendarDays } from "lucide-react";
import Link from "next/link";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export default async function ApplicantHome() {
  const session = await requireRole(["APPLICANT"]);

  const applicant = await prisma.applicant.findUnique({
    where: { userId: session.user.id },
    include: {
      preferredCollege: true,
      cycle: true,
      sensitiveInfo: true,
      documents: { select: { id: true, kind: true, fileName: true } },
      verification: true,
      callVerifications: { orderBy: { calledAt: "desc" }, take: 1 },
      interview: true,
      offlineMeeting: true,
    },
  });
  const notifications = await prisma.notification.findMany({
    where: { recipientId: session.user.id, type: "APPLICANT_UPDATE" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, title: true, body: true, createdAt: true },
  });
  const hasSubmitted = !!applicant && applicant.status !== "DRAFT";
  const callDone = applicant?.callVerifications[0]?.status === "VERIFICATION_COMPLETED";
  const physicalDone = applicant?.verification?.decision === "APPROVED";
  const onlineDone = !!applicant?.interview && applicant.interview.decision !== "PENDING";
  const finalDone = ["SELECTED", "REJECTED"].includes(applicant?.offlineMeeting?.outcome ?? "");

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
        <div className="space-y-4">
          <EmptyState icon={FileText} title="No application found" description="Start an application while an admission cycle is open." />
          <div className="text-center"><Button href="/apply" variant="primary">Start or continue application</Button></div>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-ink-muted">Application ID <span className="font-mono">{applicant.id}</span></p>
              <p className="mt-1 text-xs text-ink-faint">Admission cycle {applicant.cycle?.year ?? "Legacy"} · Submitted {applicant.submittedAt?.toLocaleDateString() ?? (hasSubmitted ? "Date not recorded" : "Not submitted")}</p>
            </div>
            <div className="flex items-center gap-3"><StatusBadge value={applicant.status} />{!hasSubmitted && <Button href="/apply" variant="primary" size="sm">Continue draft</Button>}</div>
          </Card>

          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Application progress</p>
            <ol className="mt-4 space-y-0">
              <TimelineStep label="Application submitted" done={hasSubmitted} last={false} detail={hasSubmitted ? "Received and on file" : "Finish the application and submit it"} />
              <TimelineStep label="Call verification" done={callDone} last={false} detail={applicant.callVerifications[0] ? `Latest attempt: ${applicant.callVerifications[0].status.replaceAll("_", " ")}` : "Pending assignment and a call from the verification team"} />
              <TimelineStep label="Physical verification" done={physicalDone} last={false} detail={applicant.verification ? `Decision: ${applicant.verification.decision.replaceAll("_", " ")}` : "Home visit after call verification"} />
              <TimelineStep label="Online panel interview" done={onlineDone} last={false} detail={applicant.interview ? `${applicant.interview.scheduledAt?.toLocaleString() ?? "Interview"} · ${applicant.interview.decision.replaceAll("_", " ")}` : "Scheduled after verification"} />
              <TimelineStep label="Final offline meeting" done={finalDone} last={true} detail={applicant.offlineMeeting?.scheduledAt ? `${applicant.offlineMeeting.scheduledAt.toLocaleString()} · ${applicant.offlineMeeting.location ?? "Location pending"}` : "Scheduled after the panel interview"} />
            </ol>
          </Card>

          {applicant.status === "REJECTED" && <Card className="border-danger/30 bg-danger-soft/30 p-5"><p className="font-medium text-danger">Application not selected</p><p className="mt-1 text-sm text-ink-muted">Please review the notification below for the latest information from Maatram.</p></Card>}

          {applicant.interview?.scheduledAt && <Card className="p-5"><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-4 text-accent" /><div><p className="text-sm font-medium">Online interview</p><p className="mt-1 text-sm text-ink-muted">{applicant.interview.scheduledAt.toLocaleString()} · {applicant.interview.location ?? "Details pending"}</p>{applicant.interview.meetingUrl && <a className="mt-2 inline-block text-sm text-accent hover:underline" href={applicant.interview.meetingUrl} target="_blank" rel="noreferrer">Join meeting</a>}</div></div></Card>}
          {applicant.offlineMeeting?.scheduledAt && <Card className="p-5"><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-4 text-accent" /><div><p className="text-sm font-medium">Final offline meeting</p><p className="mt-1 text-sm text-ink-muted">{applicant.offlineMeeting.scheduledAt.toLocaleString()} · {applicant.offlineMeeting.location ?? "Details pending"}</p></div></div></Card>}

          {hasSubmitted && <Card className="p-5"><h2 className="text-sm font-semibold">Submitted application</h2><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><ApplicantValue label="Phone" value={applicant.phone} /><ApplicantValue label="Email" value={applicant.email ?? "Not provided"} /><ApplicantValue label="District" value={applicant.district} /><ApplicantValue label="Community" value={applicant.community ?? "Not provided"} /><ApplicantValue label="Course interest" value={applicant.courseInterest ?? "Not provided"} /><ApplicantValue label="Board marks" value={applicant.boardPercentage == null ? "Not provided" : `${applicant.boardPercentage}%`} /><ApplicantValue label="Address" value={applicant.sensitiveInfo ? `${applicant.sensitiveInfo.addressLine1}, ${applicant.sensitiveInfo.pincode}` : "Not provided"} /></dl><div className="mt-4 border-t border-border pt-3"><p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Uploaded documents</p>{applicant.documents.length ? <ul className="mt-2 space-y-1">{applicant.documents.map((document) => <li key={document.id}><Link href={`/api/documents/${document.id}`} className="text-sm text-accent hover:underline">{document.kind.replaceAll("_", " ")} · {document.fileName}</Link></li>)}</ul> : <p className="mt-2 text-sm text-ink-faint">No documents are on file.</p>}</div></Card>}

          <Card className="p-5"><div className="flex items-center gap-2"><Bell className="size-4 text-accent" /><h2 className="text-sm font-semibold">Notifications</h2></div>{notifications.length ? <ul className="mt-3 divide-y divide-border">{notifications.map((notification) => <li key={notification.id} className="py-3 first:pt-0 last:pb-0"><p className="text-sm font-medium">{notification.title}</p><p className="mt-1 text-sm text-ink-muted">{notification.body}</p><p className="mt-1 text-xs text-ink-faint">{notification.createdAt.toLocaleString()}</p></li>)}</ul> : <p className="mt-3 text-sm text-ink-faint">No updates yet.</p>}</Card>
        </div>
      )}
    </AppShell>
  );
}

function ApplicantValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-ink-faint">{label}</dt><dd className="mt-0.5 text-ink">{value}</dd></div>;
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
