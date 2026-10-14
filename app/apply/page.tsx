export default function ApplyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Maatram Foundation
        </p>
        <h1 className="mt-2 text-xl font-semibold text-neutral-900">
          Application form — coming in Phase 2
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Phase 1 built the data model, accounts, and dashboards this form will
          write into. The multi-step application wizard (personal, academic,
          family/income, document upload, OTP save-and-resume) is the first
          thing Phase 2 builds.
        </p>
      </div>
    </div>
  );
}
