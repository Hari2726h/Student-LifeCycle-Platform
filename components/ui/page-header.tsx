import * as React from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">{eyebrow}</p>
        <h1 className="mt-1 text-balance font-display text-[1.75rem] font-medium leading-tight text-ink sm:text-[2rem]">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-xl text-[15px] text-ink-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
