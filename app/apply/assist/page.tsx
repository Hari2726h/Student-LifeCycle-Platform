import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { DISTRICTS, COURSES } from "@/lib/constants";
import { createAssistedApplication } from "../actions";

export default async function AssistPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(["VOLUNTEER"]);
  const params = await searchParams;
  const colleges = await prisma.college.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-bg px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">Field visit</p>
      <h1 className="mt-1 font-display text-2xl font-medium text-ink">
        Start an application for a visited family
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Collected in person as {session.user.name}. This is assigned straight to your verification queue — no
        separate submission step.
      </p>

      {params.error && <p className="mt-4 text-sm text-danger">{params.error}</p>}

      <form action={createAssistedApplication} className="mt-6 space-y-6">
        <Card>
          <CardHeader eyebrow="Contact" title="Family phone number" />
          <CardBody>
            <Field label="Phone number" name="phone" type="tel" inputMode="numeric" required placeholder="98765 43210" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Step 1" title="Personal details" />
          <CardBody className="space-y-4">
            <Field label="Full name" name="fullName" required />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date of birth" type="date" name="dob" required max={new Date().toISOString().slice(0, 10)} />
              <Select label="Gender" name="gender" required placeholder="Select">
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <Select label="District" name="district" required placeholder="Select district">
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
            <Field label="Email (optional)" type="email" name="email" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Step 2" title="Academic record" />
          <CardBody className="space-y-4">
            <Field label="Board exam percentage" type="number" step="0.1" min={0} max={100} name="boardPercentage" required />
            <Select label="Course of interest" name="courseInterest" required placeholder="Select a course">
              {COURSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select label="Preferred college (optional)" name="preferredCollegeId" placeholder="No preference">
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.district}
                </option>
              ))}
            </Select>
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Step 3" title="Family & income" />
          <CardBody className="space-y-4">
            <Field label="Address" name="addressLine1" required />
            <Field label="Address line 2 (optional)" name="addressLine2" />
            <Field label="Pincode" name="pincode" inputMode="numeric" maxLength={6} required />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Guardian's name" name="guardianName" required />
              <Field label="Guardian's phone" name="guardianPhone" inputMode="numeric" maxLength={10} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Annual household income (₹)" type="number" min={0} name="annualIncomeInr" />
              <Field label="Household size" type="number" min={1} max={30} name="householdSize" />
            </div>
            <Select label="Family situation" name="familySituation" required placeholder="Select">
              <option value="ORPHAN">Orphan</option>
              <option value="SINGLE_PARENT">Single parent</option>
              <option value="BOTH_PARENTS">Both parents</option>
              <option value="GUARDIAN_CARE">Guardian care</option>
              <option value="OTHER">Other</option>
            </Select>
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Step 4" title="ID proof (optional now)" description="Can also be attached later from the applicant's record" />
          <CardBody>
            <input
              type="file"
              name="idProof"
              accept="image/*,.pdf"
              className="block w-full text-sm text-ink-muted file:mr-3 file:rounded file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent-strong"
            />
          </CardBody>
        </Card>

        <Button type="submit" variant="primary" className="w-full">
          Save and add to my queue
        </Button>
      </form>
    </div>
  );
}
