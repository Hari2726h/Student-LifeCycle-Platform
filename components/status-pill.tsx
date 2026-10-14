const TONE: Record<string, string> = {
  // applicant pipeline
  SUBMITTED: "bg-neutral-100 text-neutral-700",
  UNDER_VERIFICATION: "bg-amber-100 text-amber-800",
  VERIFIED: "bg-sky-100 text-sky-800",
  INTERVIEW_SCHEDULED: "bg-sky-100 text-sky-800",
  INTERVIEWED: "bg-indigo-100 text-indigo-800",
  SHORTLISTED: "bg-indigo-100 text-indigo-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  WAITLISTED: "bg-amber-100 text-amber-800",
  WITHDRAWN: "bg-neutral-100 text-neutral-500",
  // student lifecycle
  ONBOARDING: "bg-sky-100 text-sky-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PLACED: "bg-indigo-100 text-indigo-800",
  ALUMNI: "bg-violet-100 text-violet-800",
  DROPPED_OUT: "bg-rose-100 text-rose-800",
  // risk severity
  LOW: "bg-neutral-100 text-neutral-600",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-rose-100 text-rose-800",
};

export function StatusPill({ value }: { value: string }) {
  const tone = TONE[value] ?? "bg-neutral-100 text-neutral-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
