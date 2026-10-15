import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { t, type Lang } from "@/lib/i18n";
import { saveStep3 } from "../actions";
import type { ApplicantSensitiveInfo } from "@prisma/client";

export function FamilyStep({
  lang,
  info,
  error,
}: {
  lang: Lang;
  info: ApplicantSensitiveInfo | null;
  error?: string;
}) {
  const strings = t(lang);

  return (
    <form action={saveStep3} className="space-y-4">
      <Field label={strings.addressLine1} name="addressLine1" required defaultValue={info?.addressLine1} error={error} />
      <Field label={strings.addressLine2} name="addressLine2" defaultValue={info?.addressLine2 ?? ""} />
      <Field label={strings.pincode} name="pincode" inputMode="numeric" maxLength={6} required defaultValue={info?.pincode} />
      <div className="grid grid-cols-2 gap-4">
        <Field label={strings.guardianName} name="guardianName" required defaultValue={info?.guardianName} />
        <Field label={strings.guardianPhone} name="guardianPhone" inputMode="numeric" maxLength={10} required defaultValue={info?.guardianPhone} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={strings.annualIncome} type="number" name="annualIncomeInr" min={0} defaultValue={info?.annualIncomeInr ?? undefined} />
        <Field label={strings.householdSize} type="number" name="householdSize" min={1} max={30} defaultValue={info?.householdSize ?? undefined} />
      </div>
      <Select label={strings.familySituation} name="familySituation" required defaultValue={info?.familySituation ?? ""} placeholder="Select">
        <option value="ORPHAN">Orphan</option>
        <option value="SINGLE_PARENT">Single parent</option>
        <option value="BOTH_PARENTS">Both parents</option>
        <option value="GUARDIAN_CARE">Guardian care</option>
        <option value="OTHER">Other</option>
      </Select>
      <div className="flex gap-3">
        <Button href="/apply?step=2" variant="secondary" className="flex-1">
          {strings.backBtn}
        </Button>
        <Button type="submit" variant="primary" className="flex-1">
          {strings.continueBtn}
        </Button>
      </div>
    </form>
  );
}
