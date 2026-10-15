import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { COURSES } from "@/lib/constants";
import { t, type Lang } from "@/lib/i18n";
import { saveStep2 } from "../actions";
import type { Applicant, College } from "@prisma/client";

export function AcademicStep({
  lang,
  applicant,
  colleges,
  error,
}: {
  lang: Lang;
  applicant: Applicant;
  colleges: College[];
  error?: string;
}) {
  const strings = t(lang);

  return (
    <form action={saveStep2} className="space-y-4">
      <Field
        label={strings.boardPercentage}
        type="number"
        name="boardPercentage"
        step="0.1"
        min={0}
        max={100}
        required
        defaultValue={applicant.boardPercentage ?? undefined}
        error={error}
      />
      <Select label={strings.courseInterest} name="courseInterest" required defaultValue={applicant.courseInterest ?? ""} placeholder="Select a course">
        {COURSES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Select label={strings.preferredCollege} name="preferredCollegeId" defaultValue={applicant.preferredCollegeId ?? ""} placeholder="No preference">
        {colleges.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.district}
          </option>
        ))}
      </Select>
      <div className="flex gap-3">
        <Button href="/apply?step=1" variant="secondary" className="flex-1">
          {strings.backBtn}
        </Button>
        <Button type="submit" variant="primary" className="flex-1">
          {strings.continueBtn}
        </Button>
      </div>
    </form>
  );
}
