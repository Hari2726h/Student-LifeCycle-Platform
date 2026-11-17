import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DISTRICTS } from "@/lib/constants";
import { t, type Lang } from "@/lib/i18n";
import { saveStep1 } from "../actions";
import type { Applicant } from "@prisma/client";

export function PersonalStep({ lang, applicant, aadhaarLast4, error }: { lang: Lang; applicant: Applicant | null; aadhaarLast4?: string; error?: string }) {
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
      <Field
        label="Aadhaar number"
        name="aadhaarNumber"
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        minLength={12}
        pattern="[0-9]{12}"
        required={!aadhaarLast4}
        placeholder={aadhaarLast4 ? `Saved securely · ending ${aadhaarLast4}` : "12 digits"}
      />
      <p className="-mt-2 text-xs text-ink-faint">We store a keyed hash and the last four digits only. The full number is never saved.</p>
      <Select label={strings.district} name="district" required defaultValue={applicant?.district ?? ""} placeholder="Select your district">
        {DISTRICTS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </Select>
      <Field label="Community (optional)" name="community" defaultValue={applicant?.community ?? ""} maxLength={80} />
      <Field label="Email (optional)" type="email" name="email" defaultValue={applicant?.email ?? ""} />
      <Button type="submit" variant="primary" className="w-full">
        {strings.continueBtn}
      </Button>
    </form>
  );
}
