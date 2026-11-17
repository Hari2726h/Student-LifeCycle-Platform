"use client";

import { useState } from "react";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type SiblingValue = {
  name: string;
  age: number | string;
  qualification: string;
  studyingThroughMaatram: "YES" | "NO";
};

export function SiblingFields({ initial = [] }: { initial?: SiblingValue[] }) {
  const [siblings, setSiblings] = useState<SiblingValue[]>(initial.length ? initial : []);
  return (
    <div className="space-y-3">
      {siblings.map((sibling, index) => (
        <fieldset key={index} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-medium text-ink-muted">Sibling {index + 1}</legend>
          <Field id={`sibling-name-${index}`} label="Name" name="siblingName" defaultValue={sibling.name} maxLength={120} />
          <Field id={`sibling-age-${index}`} label="Age" name="siblingAge" type="number" min={0} max={100} defaultValue={sibling.age} />
          <Field id={`sibling-qualification-${index}`} label="Educational qualification" name="siblingQualification" defaultValue={sibling.qualification} maxLength={120} />
          <Select id={`sibling-maatram-${index}`} label="Studying through Maatram?" name="siblingMaatram" defaultValue={sibling.studyingThroughMaatram}><option value="YES">Yes</option><option value="NO">No</option></Select>
          <div className="sm:col-span-2"><Button type="button" variant="ghost" size="sm" onClick={() => setSiblings((current) => current.filter((_, i) => i !== index))}>Remove sibling</Button></div>
        </fieldset>
      ))}
      {siblings.length < 10 && <Button type="button" variant="secondary" size="sm" onClick={() => setSiblings((current) => [...current, { name: "", age: "", qualification: "", studyingThroughMaatram: "NO" }])}>Add sibling</Button>}
    </div>
  );
}
