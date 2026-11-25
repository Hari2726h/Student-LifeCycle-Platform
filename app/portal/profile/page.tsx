import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getPortalNav } from "@/lib/portal-nav";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateProfile } from "../actions";

export default async function PortalProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const session = await requireRole(["STUDENT", "ALUMNI"]);
  const [user, query] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      include: { studentProfile: { include: { alumniProfile: true } } },
    }),
    searchParams,
  ]);
  const alumniProfile = user.studentProfile?.alumniProfile ?? null;

  return (
    <AppShell role={session.user.role} name={user.name} nav={getPortalNav()}>
      <PageHeader
        eyebrow={session.user.role === "ALUMNI" ? "Alumni" : "Student"}
        title="My profile"
        description="Update your own contact details."
      />
      {query.error && <p role="alert" className="mb-4 text-sm text-danger">{query.error}</p>}
      {query.saved && <p role="status" className="mb-4 text-sm text-success">Profile saved.</p>}

      <Card>
        <CardHeader title="Contact details" />
        <CardBody>
          <form action={updateProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" name="name" defaultValue={user.name} required />
              <Field label="Email" name="email" defaultValue={user.email} disabled />
              <Field label="Mobile number" name="phone" defaultValue={user.phone ?? ""} />
            </div>
            {session.user.role === "ALUMNI" && (
              <TextArea
                label="Bio (optional)"
                name="bio"
                rows={3}
                defaultValue={alumniProfile?.bio ?? ""}
                placeholder="A line or two about yourself, shown to students who look you up as a mentor"
              />
            )}
            <Button type="submit">Save profile</Button>
          </form>
        </CardBody>
      </Card>
    </AppShell>
  );
}
