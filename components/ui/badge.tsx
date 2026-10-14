import * as React from "react";

type Tone = "neutral" | "accent" | "gold" | "success" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-muted",
  accent: "bg-accent-soft text-accent-strong",
  gold: "bg-gold-soft text-gold",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

// Every lifecycle/application status in the schema maps to exactly one
// tone, so the same status always reads the same way anywhere it appears.
const STATUS_TONE: Record<string, Tone> = {
  SUBMITTED: "neutral",
  UNDER_VERIFICATION: "warning",
  VERIFIED: "info",
  INTERVIEW_SCHEDULED: "info",
  INTERVIEWED: "accent",
  SHORTLISTED: "accent",
  ACCEPTED: "success",
  REJECTED: "danger",
  WAITLISTED: "warning",
  WITHDRAWN: "neutral",
  ONBOARDING: "info",
  ACTIVE: "success",
  PLACED: "accent",
  ALUMNI: "gold",
  DROPPED_OUT: "danger",
  LOW: "neutral",
  MEDIUM: "warning",
  HIGH: "danger",
  COMPLETED: "success",
  IN_PROGRESS: "info",
  LAPSED: "neutral",
};

export function Badge({
  tone = "neutral",
  children,
  dot = false,
  className = "",
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-tight ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Badge pre-wired to the lifecycle/application status vocabulary. */
export function StatusBadge({ value, className = "" }: { value: string; className?: string }) {
  const tone = STATUS_TONE[value] ?? "neutral";
  return (
    <Badge tone={tone} dot className={className}>
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
