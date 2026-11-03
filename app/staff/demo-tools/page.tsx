import { FlaskConical, ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { getStaffNav } from "@/lib/staff-nav";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { runWipeAndReplay } from "./actions";

export default async function DemoToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; error?: string }>;
}) {
  const session = await requireRole(["STAFF"]);
  const { result, error } = await searchParams;
  const nav = await getStaffNav("STAFF", session.user.id);

  return (
    <AppShell role="STAFF" name={session.user.name ?? "Staff"} nav={nav}>
      <PageHeader
        eyebrow="Ops · demo"
        title="Demo tools"
        description="Prove the event-sourcing claim live, not just assert it."
      />

      {result && <div className="mb-4 rounded-md border border-success/30 bg-success-soft/50 px-3 py-2 text-sm text-success">{decodeURIComponent(result)}</div>}
      {error && <p className="mb-4 text-sm text-danger">{decodeURIComponent(error)}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              eyebrow="Reproducibility"
              title="Wipe & replay derived state"
              description="Deletes every notification and webhook-delivery record, clears every alumnus's cached current role/company, rewinds both replay bookmarks to zero — then rebuilds all of it from nothing but the Event log."
              action={<FlaskConical className="size-4 text-ink-faint" aria-hidden />}
            />
            <CardBody className="space-y-4">
              <form action={runWipeAndReplay}>
                <ConfirmSubmitButton
                  variant="danger"
                  className="w-full"
                  confirmMessage="This deletes all Notification and WebhookDelivery rows and clears AlumniProfile's cached current role/company, then rebuilds all of it from the Event log. Nothing in the Event log, CareerEvent log, or any core domain table (Applicant, Student, Verification, InterviewRecord, etc.) is touched. Continue?"
                >
                  Wipe & replay now
                </ConfirmSubmitButton>
              </form>
              <div className="rounded-md border border-border bg-canvas-subtle/60 p-3 text-xs text-ink-faint">
                <p className="mb-1 flex items-center gap-1.5 font-medium text-ink-muted">
                  <ShieldCheck className="size-3.5" aria-hidden /> What this never touches
                </p>
                The Event log itself, every CareerEvent, and every core domain record (Applicant, Student,
                Verification, InterviewRecord, Document, …) are source-of-truth data, not projections — this tool
                only ever deletes and rebuilds the three caches derived from them.
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader eyebrow="Scope note" title="What's not here" />
            <CardBody>
              <p className="text-sm text-ink-muted">
                A literal &ldquo;simulate outage&rdquo; toggle (cutting the app&apos;s own DB/storage connection on
                command) was deliberately left out — safely flipping real connectivity off and back on from inside
                the app it would be breaking is more chaos-engineering infrastructure than a demo button can
                responsibly be. The friendly-error behavior itself is covered — see the demo script — but it was
                exercised by actually stopping the Postgres/storage containers, not a toggle in the UI.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
