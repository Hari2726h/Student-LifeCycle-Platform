"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { FilePreviewInput } from "@/components/ui/file-preview-input";
import { submitActivityExpense } from "../actions";

type AssignmentOption = { id: string; label: string };

export function ExpenseLinesForm({
  assignments,
  initialItemKeys,
  today,
}: {
  assignments: AssignmentOption[];
  initialItemKeys: string[];
  today: string;
}) {
  const [itemKeys, setItemKeys] = useState(initialItemKeys);

  function addItem() {
    if (itemKeys.length < 4) setItemKeys((items) => [...items, crypto.randomUUID()]);
  }

  function removeItem(key: string) {
    setItemKeys((items) => items.length > 1 ? items.filter((item) => item !== key) : items);
  }

  return (
    <form action={submitActivityExpense} className="space-y-5">
      <Select label="Activity" name="assignmentId" required placeholder="Select assigned activity">
        {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.label}</option>)}
      </Select>

      <section aria-labelledby="expense-lines-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="expense-lines-heading" className="text-lg font-medium text-ink">Expense line items</h2>
            <p className="text-xs text-ink-muted">Add each expense separately. Attach a receipt to every line.</p>
          </div>
          <span className="text-xs text-ink-faint">{itemKeys.length}/4 items</span>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-surface-sunken text-ink">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">Description <span className="text-danger" aria-hidden="true">*</span></th>
                <th scope="col" className="px-3 py-3 font-medium">Category <span className="text-danger" aria-hidden="true">*</span></th>
                <th scope="col" className="px-3 py-3 font-medium">Expense date <span className="text-danger" aria-hidden="true">*</span></th>
                <th scope="col" className="px-3 py-3 font-medium">Amount (₹) <span className="text-danger" aria-hidden="true">*</span></th>
                <th scope="col" className="px-3 py-3 font-medium">Attachment <span className="text-danger" aria-hidden="true">*</span></th>
                <th scope="col" className="px-3 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {itemKeys.map((key, index) => (
                <tr key={key} className="border-t border-border align-top">
                  <td className="min-w-56 px-3 py-3">
                    <input type="hidden" name="expenseItemKey" value={key} />
                    <Field label={`Description for item ${index + 1}`} name={`description_${key}`} required maxLength={300} className="mt-0" aria-label={`Description for item ${index + 1}`} />
                  </td>
                  <td className="min-w-52 px-3 py-3">
                    <Select label={`Category for item ${index + 1}`} name={`category_${key}`} required className="mt-0" aria-label={`Category for item ${index + 1}`}>
                      <option value="Travel">Travel</option><option value="Food">Food</option><option value="Accommodation">Accommodation</option><option value="Materials">Materials</option><option value="Other">Other</option>
                    </Select>
                  </td>
                  <td className="min-w-44 px-3 py-3">
                    <Field label={`Expense date for item ${index + 1}`} name={`expenseAt_${key}`} type="date" defaultValue={today} required className="mt-0" aria-label={`Expense date for item ${index + 1}`} />
                  </td>
                  <td className="min-w-44 px-3 py-3">
                    <Field label={`Amount for item ${index + 1}`} name={`amount_${key}`} type="number" min="0.01" max="1000000" step="0.01" required className="mt-0" aria-label={`Amount for item ${index + 1}`} />
                  </td>
                  <td className="min-w-64 px-3 py-3">
                    <FilePreviewInput label={`Receipt attachment for item ${index + 1}`} name={`receipt_${key}`} accept="image/*,application/pdf" required />
                    <p className="mt-1 text-xs text-ink-faint">Image or PDF, maximum 8 MB</p>
                  </td>
                  <td className="px-3 py-3">
                    <Button type="button" variant="danger" size="sm" disabled={itemKeys.length === 1} onClick={() => removeItem(key)} aria-label={`Remove item ${index + 1}`}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={addItem} disabled={itemKeys.length >= 4}>Add item</Button>
      </section>

      <p className="text-xs text-ink-faint">Receipt files are private and accessible only to you and authorized staff. Each line is sent for staff approval.</p>
      <Button type="submit" variant="primary">Submit expenses</Button>
    </form>
  );
}
