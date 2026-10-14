import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-contrast hover:bg-accent-strong disabled:bg-accent/50 shadow-sm",
  secondary:
    "bg-surface text-ink border border-border hover:border-border-strong hover:bg-surface-sunken disabled:opacity-50",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-sunken disabled:opacity-50",
  danger: "bg-danger text-accent-contrast hover:opacity-90 disabled:opacity-50",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

const BASE =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors duration-150 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
};

type ButtonProps = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type LinkProps = CommonProps &
  React.ComponentProps<typeof Link> & { href: string };

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  children,
  href,
  ...props
}: ButtonProps | LinkProps) {
  const classes = `${BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`;

  if (href) {
    const linkProps = props as Omit<React.ComponentProps<typeof Link>, "href">;
    return (
      <Link href={href} className={classes} {...linkProps}>
        {children}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      disabled={loading || (props as React.ButtonHTMLAttributes<HTMLButtonElement>).disabled}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
