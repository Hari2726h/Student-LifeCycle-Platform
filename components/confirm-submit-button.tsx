"use client";

import { Button } from "@/components/ui/button";

/** A native confirm() in front of a server action submit — used for
 * actions that touch many rows at once, even when (like this one) nothing
 * destructive to source-of-truth data actually happens. Transparency over
 * trust: the user should see the scope of what they're about to run. */
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  variant,
  className,
}: {
  confirmMessage: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      onClick={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
