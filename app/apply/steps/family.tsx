import { Field, Select, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { t, type Lang } from "@/lib/i18n";
import { saveStep3 } from "../actions";
import type { ApplicantSensitiveInfo } from "@prisma/client";
import { SiblingFields, type SiblingValue } from "./sibling-fields";

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
  const family = info?.familyDetails && typeof info.familyDetails === "object" && !Array.isArray(info.familyDetails)
    ? info.familyDetails as Record<string, unknown>
    : {};
  const value = (key: string, fallback = "") => typeof family[key] === "string" ? family[key] as string : fallback;
  const siblings = Array.isArray(family.siblings) ? family.siblings as SiblingValue[] : [];

  return (
    <form action={saveStep3} className="space-y-4">
      <Field label={strings.addressLine1} name="addressLine1" required defaultValue={info?.addressLine1} error={error} />
      <Field label={strings.addressLine2} name="addressLine2" defaultValue={info?.addressLine2 ?? ""} />
      <Field label={strings.pincode} name="pincode" inputMode="numeric" maxLength={6} required defaultValue={info?.pincode} />
      <div className="grid grid-cols-2 gap-4">
        <Field label={strings.guardianName} name="guardianName" required defaultValue={info?.guardianName} />
        <Field label={strings.guardianPhone} name="guardianPhone" inputMode="numeric" maxLength={10} required defaultValue={info?.guardianPhone} />
      </div>
      <section className="space-y-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold">Parents and siblings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Father's name" name="fatherName" required defaultValue={value("fatherName")} />
          <Field label="Father's occupation" name="fatherOccupation" required defaultValue={value("fatherOccupation")} />
          <Field label="Mother's name" name="motherName" required defaultValue={value("motherName")} />
          <Field label="Mother's occupation" name="motherOccupation" required defaultValue={value("motherOccupation")} />
          <Field label="Parents' contact number" name="parentsContactNumber" type="tel" inputMode="numeric" maxLength={10} required defaultValue={value("parentsContactNumber")} />
          <Select label="House ownership" name="houseOwnership" required defaultValue={value("houseOwnership")} placeholder="Select"><option value="OWN">Own house</option><option value="RENTED">Rented house</option><option value="OTHER">Other</option></Select>
          <Field label="State" name="state" required defaultValue={value("state", "Tamil Nadu")} />
        </div>
        <div><p className="mb-2 text-sm font-medium">Sibling details</p><SiblingFields initial={siblings} /></div>
      </section>
      <div className="grid grid-cols-2 gap-4">
        <Field label={strings.annualIncome} type="number" name="annualIncomeInr" min={0} required defaultValue={info?.annualIncomeInr ?? undefined} />
        <Field label={strings.householdSize} type="number" name="householdSize" min={1} max={30} defaultValue={info?.householdSize ?? undefined} />
      </div>
      <Select label={strings.familySituation} name="familySituation" required defaultValue={info?.familySituation ?? ""} placeholder="Select">
        <option value="ORPHAN">Orphan</option>
        <option value="SINGLE_PARENT">Single parent</option>
        <option value="BOTH_PARENTS">Both parents</option>
        <option value="GUARDIAN_CARE">Guardian care</option>
        <option value="OTHER">Other</option>
      </Select>
      <section className="space-y-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold">Admission eligibility</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ["tamilNaduCounselling", "Applied through Tamil Nadu counselling?"],
            ["firstGeneration", "First-generation graduate/student?"],
            ["governmentSchoolReservation", "Eligible for the 7.5% government-school reservation?"],
            ["maatramSibling", "Do you have a sibling studying through Maatram?"],
            ["currentlyWorking", "Are you currently working?"],
          ] as const).map(([name, label]) => (
            <Select key={name} label={label} name={name} required defaultValue={value(name)} placeholder="Select"><option value="YES">Yes</option><option value="NO">No</option></Select>
          ))}
        </div>
        <Field label="Work details (if currently working)" name="currentWorkDetails" defaultValue={value("currentWorkDetails")} maxLength={250} />
        <Select label="How did you hear about Maatram?" name="howHeardAbout" required defaultValue={value("howHeardAbout")} placeholder="Select"><option>School</option><option>Friend or family</option><option>Social media</option><option>Volunteer</option><option>College</option><option>Other</option></Select>
        <TextArea label="Other relevant information (optional)" name="additionalInformation" rows={3} defaultValue={value("additionalInformation")} maxLength={2000} />
      </section>
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
