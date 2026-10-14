import * as React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Field({
  label,
  error,
  id,
  className = "",
  ...props
}: InputProps) {
  const fieldId = id ?? props.name;
  return (
    <div>
      <label htmlFor={fieldId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={fieldId}
        className={`mt-1.5 w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 ${
          error ? "border-danger" : "border-border focus:border-accent"
        } ${className}`}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${fieldId}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
