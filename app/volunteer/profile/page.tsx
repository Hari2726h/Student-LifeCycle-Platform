import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateVolunteerProfile } from "../actions";

export default async function VolunteerProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const session = await requireRole(["VOLUNTEER"]);
  const [user, query] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, include: { volunteerProfile: true, activityAssignments: { include: { reports: true } }, tutoringSessions: true } }),
    searchParams,
  ]);
  const hours = user.activityAssignments.reduce((sum, assignment) => sum + assignment.reports.reduce((total, report) => total + report.hours, 0), 0) + user.tutoringSessions.reduce((sum, item) => sum + item.durationHours, 0);
  const completed = user.activityAssignments.filter((assignment) => assignment.status === "COMPLETED").length;
  const profile = user.volunteerProfile;
  return (
    <VolunteerShell name={user.name}>
      <PageHeader eyebrow="Volunteer profile" title={user.name} description={`Volunteer ID ${user.id}`} />
      {query.error && <p role="alert" className="mb-4 text-sm text-danger">{query.error}</p>}
      {query.saved && <p role="status" className="mb-4 text-sm text-success">Profile saved.</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card><CardHeader title="Contact and interests" description="You can update your own contact details and volunteering preferences." /><CardBody>
          <form action={updateVolunteerProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Name" name="name" defaultValue={user.name} required /><Field label="Email" name="email" defaultValue={user.email ?? ""} disabled /><Field label="Mobile number" name="phone" defaultValue={user.phone ?? ""} /><Field label="Profile photo URL" name="profilePhotoUrl" type="url" defaultValue={profile?.profilePhotoUrl ?? ""} placeholder="https://…" /></div>
            <TextArea label="Address" name="address" rows={2} defaultValue={profile?.address ?? ""} />
            <Field label="Skills (comma separated)" name="skills" defaultValue={profile?.skills.join(", ") ?? ""} placeholder="Tutoring, communication, event support" />
            <Field label="Areas of interest (comma separated)" name="interests" defaultValue={profile?.interests.join(", ") ?? ""} />
            <TextArea label="Availability" name="availability" rows={2} defaultValue={profile?.availability ?? ""} placeholder="Weekday evenings, Saturday mornings" />
            <Button type="submit">Save profile</Button>
          </form>
        </CardBody></Card>
        <Card><CardHeader title="Contribution" /><CardBody className="space-y-3 text-sm">
          <p className="flex justify-between"><span className="text-ink-muted">Assigned activities</span><strong>{user.activityAssignments.length}</strong></p>
          <p className="flex justify-between"><span className="text-ink-muted">Completed activities</span><strong>{completed}</strong></p>
          <p className="flex justify-between"><span className="text-ink-muted">Teaching sessions</span><strong>{user.tutoringSessions.length}</strong></p>
          <p className="flex justify-between border-t border-border pt-3"><span className="text-ink-muted">Volunteer hours</span><strong>{hours.toFixed(1)}</strong></p>
          {profile?.profilePhotoUrl && <a className="block truncate pt-2 text-accent" href={profile.profilePhotoUrl} target="_blank" rel="noreferrer">View profile photo</a>}
        </CardBody></Card>
      </div>
    </VolunteerShell>
  );
}
