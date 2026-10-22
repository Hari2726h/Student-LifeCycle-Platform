import * as React from "react";

export function TableScroll({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-border">{children}</div>;
}

export function Table({ children }: { children: React.ReactNode }) {
  return <table className="w-full border-collapse text-sm">{children}</table>;
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-surface-sunken">{children}</thead>;
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint ${className}`}
    >
      {children}
    </th>
  );
}

export function Tr({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={`border-t border-border transition-colors hover:bg-surface-sunken/60 ${className}`}>
      {children}
    </tr>
  );
}

export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle text-ink ${className}`}>{children}</td>;
}
