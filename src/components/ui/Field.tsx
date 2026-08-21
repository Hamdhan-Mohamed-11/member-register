import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const controlBase =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink " +
  "placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-600 " +
  "focus:border-transparent disabled:opacity-60";

export function Field({
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const inputId = id ?? props.name;
  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink mb-1.5">
        {label}
      </label>
      <input
        id={inputId}
        className={`${controlBase} min-h-11`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextareaField({
  label,
  hint,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
}) {
  const inputId = id ?? props.name;
  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink mb-1.5">
        {label}
      </label>
      <textarea id={inputId} rows={4} className={controlBase} {...props} />
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** Inline status message. `tone` picks the colour, not the semantics. */
export function Notice({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    error: "bg-danger-100 text-danger-600",
    success: "bg-success-100 text-success-600",
    info: "bg-brand-50 text-brand-700",
  } as const;

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg px-3 py-2.5 text-sm ${tones[tone]}`}
    >
      {children}
    </p>
  );
}
