import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DISTRICTS } from "@/lib/constants";
import { t, type Lang } from "@/lib/i18n";
import { saveStep1 } from "../actions";
import type { Applicant } from "@prisma/client";

export function PersonalStep({ lang, applicant, error }: { lang: Lang; applicant: Applicant | null; error?: string }) {
  const strings = t(lang);
  const dobValue = applicant?.dob ? applicant.dob.toISOString().slice(0, 10) : "";

  return (
    <form action={saveStep1} className="space-y-4">
      <Field label={strings.fullName} name="fullName" required defaultValue={applicant?.fullName} error={error} />
      <div className="grid grid-cols-2 gap-4">
        <Field label={strings.dob} type="date" name="dob" required defaultValue={dobValue} max={new Date().toISOString().slice(0, 10)} />
        <Select label={strings.gender} name="gender" required defaultValue={applicant?.gender ?? ""} placeholder="Select">
          <option value="FEMALE">Female</option>
          <option value="MALE">Male</option>
          <option value="OTHER">Other</option>
        </Select>
      </div>
      <Select label={strings.district} name="district" required defaultValue={applicant?.district ?? ""} placeholder="Select your district">
        {DISTRICTS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </Select>
      <Field label="Email (optional)" type="email" name="email" defaultValue={applicant?.email ?? ""} />
      <Button type="submit" variant="primary" className="w-full">
        {strings.continueBtn}
      </Button>
    </form>
  );
}
