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
  errorField,
}: {
  lang: Lang;
  applicant: Applicant;
  colleges: College[];
  error?: string;
  errorField?: string;
}) {
  const strings = t(lang);
  const details = applicant.academicDetails && typeof applicant.academicDetails === "object" && !Array.isArray(applicant.academicDetails)
    ? applicant.academicDetails as Record<string, unknown>
    : {};
  const textValue = (key: string) => details[key] == null ? "" : String(details[key]);
  const fieldError = (name: string) => (errorField === name ? error : undefined);

  return (
    <form action={saveStep2} className="space-y-4">
      {error && !errorField && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Field
        label={strings.boardPercentage}
        type="number"
        name="boardPercentage"
        step="0.1"
        min={0}
        max={100}
        required
        defaultValue={applicant.boardPercentage ?? undefined}
        error={fieldError("boardPercentage")}
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
      <section className="space-y-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold">10th standard</h2>
        <Field label="School name" name="school10Name" required defaultValue={textValue("school10Name")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="School type" name="school10Type" required defaultValue={textValue("school10Type")} placeholder="Select"><option value="GOVERNMENT">Government</option><option value="PRIVATE">Private</option></Select>
          <Select label="Curriculum" name="school10Curriculum" required defaultValue={textValue("school10Curriculum")} placeholder="Select"><option value="STATE_BOARD">State Board</option><option value="CBSE">CBSE</option><option value="OTHER">Other</option></Select>
          <Field label="Year of passing" name="school10Year" type="number" min={1990} max={2100} required defaultValue={textValue("school10Year")} error={fieldError("school10Year")} />
          <Field label="Marks obtained" name="school10Marks" type="number" min={0} max={1000} step="0.01" required defaultValue={textValue("school10Marks")} error={fieldError("school10Marks")} />
        </div>
        <Field label="School address" name="school10Address" required defaultValue={textValue("school10Address")} />
      </section>
      <section className="space-y-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold">11th standard</h2>
        <Field label="School name" name="school11Name" required defaultValue={textValue("school11Name")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="School type" name="school11Type" required defaultValue={textValue("school11Type")} placeholder="Select"><option value="GOVERNMENT">Government</option><option value="PRIVATE">Private</option></Select>
          <Select label="Medium of instruction" name="school11Medium" required defaultValue={textValue("school11Medium")} placeholder="Select"><option value="TAMIL">Tamil</option><option value="ENGLISH">English</option><option value="OTHER">Other</option></Select>
          <Select label="Curriculum" name="school11Curriculum" required defaultValue={textValue("school11Curriculum")} placeholder="Select"><option value="STATE_BOARD">State Board</option><option value="CBSE">CBSE</option><option value="OTHER">Other</option></Select>
          <Field label="Marks obtained" name="school11Marks" type="number" min={0} max={1000} step="0.01" required defaultValue={textValue("school11Marks")} error={fieldError("school11Marks")} />
        </div>
      </section>
      <section className="space-y-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold">12th standard</h2>
        <Field label="School name" name="school12Name" required defaultValue={textValue("school12Name")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="School type" name="school12Type" required defaultValue={textValue("school12Type")} placeholder="Select"><option value="GOVERNMENT">Government</option><option value="PRIVATE">Private</option></Select>
          <Select label="Medium of instruction" name="school12Medium" required defaultValue={textValue("school12Medium")} placeholder="Select"><option value="TAMIL">Tamil</option><option value="ENGLISH">English</option><option value="OTHER">Other</option></Select>
          <Select label="Curriculum" name="school12Curriculum" required defaultValue={textValue("school12Curriculum")} placeholder="Select"><option value="STATE_BOARD">State Board</option><option value="CBSE">CBSE</option><option value="OTHER">Other</option></Select>
          <Field label="Marks obtained" name="school12Marks" type="number" min={0} max={1000} step="0.01" required defaultValue={textValue("school12Marks")} error={fieldError("school12Marks")} />
          <Field label="Cutoff marks" name="school12CutoffMarks" type="number" min={0} max={1000} step="0.01" required defaultValue={textValue("school12CutoffMarks")} error={fieldError("school12CutoffMarks")} />
          <Field label="Year of passing" name="school12Year" type="number" min={1990} max={2100} required defaultValue={textValue("school12Year")} error={fieldError("school12Year")} />
          <Field label="Headmaster's name" name="headmasterName" required defaultValue={textValue("headmasterName")} />
          <Field label="Headmaster's contact number" name="headmasterPhone" type="tel" inputMode="numeric" maxLength={10} required defaultValue={textValue("headmasterPhone")} error={fieldError("headmasterPhone")} />
        </div>
        <Field label="School address" name="school12Address" required defaultValue={textValue("school12Address")} />
      </section>
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
