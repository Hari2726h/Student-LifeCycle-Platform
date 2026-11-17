import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ExpenseLinesForm } from "./expense-lines-form";

export default async function VolunteerExpenses({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const session = await requireRole(["VOLUNTEER"]);
  const query = await searchParams;
  const [assignments, expenses] = await Promise.all([
    prisma.activityAssignment.findMany({ where: { volunteerId: session.user.id, status: { notIn: ["CANCELLED"] } }, include: { activity: { select: { id: true, name: true, type: true } } }, orderBy: { assignedAt: "desc" } }),
    prisma.activityExpense.findMany({ where: { volunteerId: session.user.id }, include: { activity: { select: { name: true } } }, orderBy: { expenseAt: "desc" }, take: 100 }),
  ]);
  return (
    <VolunteerShell name={session.user.name ?? "Volunteer"}>
      <PageHeader eyebrow="Reimbursements" title="Activity expenses" description="Submit expense line items with receipts for staff approval." />
      {query.error && <p role="alert" className="mb-4 text-sm text-danger">{query.error}</p>}{query.saved && <p role="status" className="mb-4 text-sm text-success">{query.saved} expense line item{query.saved === "1" ? "" : "s"} submitted for approval.</p>}
      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card><CardHeader title="Add expenses" description="Submit multiple receipt-backed expense lines for your assigned activity." /><CardBody>
          {assignments.length ? <ExpenseLinesForm
            assignments={assignments.map((assignment) => ({ id: assignment.id, label: `${assignment.activity.name} · ${assignment.activity.type.replaceAll("_", " ")}` }))}
            initialItemKeys={[randomUUID(), randomUUID()]}
            today={new Date().toISOString().slice(0, 10)}
          /> : <p className="text-sm text-ink-muted">An assigned activity is required before an expense can be submitted.</p>}
        </CardBody></Card>
        <Card><CardHeader title="Expense history" description="Latest 100 expense lines" /><CardBody className="overflow-x-auto">
          {expenses.length ? <table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-border text-xs uppercase text-ink-faint"><tr><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Activity / description</th><th className="py-2 pr-3">Category</th><th className="py-2 pr-3">Amount</th><th className="py-2 pr-3">Status</th><th className="py-2">Receipt</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b border-border last:border-0"><td className="py-3 pr-3">{expense.expenseAt.toLocaleDateString()}</td><td className="py-3 pr-3"><p>{expense.activity.name}</p><p className="text-xs text-ink-muted">{expense.description}</p>{expense.reviewNote && <p className="text-xs text-ink-faint">{expense.reviewNote}</p>}</td><td className="py-3 pr-3">{expense.category}</td><td className="py-3 pr-3">₹{Number(expense.amount).toLocaleString("en-IN")}</td><td className="py-3 pr-3"><StatusBadge value={expense.status} /></td><td className="py-3">{expense.receiptName ? <a className="text-accent" href={`/api/expense-receipts/${expense.id}`}>View</a> : "—"}</td></tr>)}</tbody></table> : <p className="text-sm text-ink-muted">No expenses submitted yet.</p>}
        </CardBody></Card>
      </div>
    </VolunteerShell>
  );
}
