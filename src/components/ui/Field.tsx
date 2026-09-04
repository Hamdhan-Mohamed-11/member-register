import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * One control surface for every input, select and textarea in the app.
 *
 * Exported, because four files were each keeping their own near-copy of this
 * string and they had already drifted -- some had `py-2.5`, some did not, and
 * the book filters had a different height from the forms next to them.
 *
 * The ring is drawn OUTSIDE the box (`ring-offset-1`) rather than replacing the
 * border, so focusing a field does not change its size and shift the layout.
 */
export const controlClassName =
  "w-full min-h-11 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink " +
  "transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-faint hover:border-brand-500/60 " +
  "focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25 " +
  "disabled:opacity-60 disabled:bg-canvas";

/**
 * Selects additionally hide the native arrow and draw their own, because the
 * platform one differs on every OS and made the selects look like a different
 * component from the inputs beside them.
 *
 * `.select-chevron` is a real rule in globals.css, NOT a Tailwind arbitrary
 * value. As `bg-[image:url("data:image/svg+xml,…")]` the class name has to
 * carry escaped quotes through Tailwind's escaping and out the other side, and
 * the CSS optimizer rejects what comes back as a BadUrl -- the build warns and
 * the arrow silently never renders.
 */
export const selectClassName = `${controlClassName} select-chevron`;

function Label({ htmlFor, children }: { htmlFor?: string; children: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium text-ink mb-1.5"
    >
      {children}
    </label>
  );
}

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
      <Label htmlFor={inputId}>{label}</Label>
      <input
        id={inputId}
        className={`${controlClassName} ${
          error ? "border-danger-600 focus:border-danger-600 focus:ring-danger-600/25" : ""
        }`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
}) {
  const inputId = id ?? props.name;
  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <select id={inputId} className={selectClassName} {...props}>
        {children}
      </select>
      {hint ? <p className="mt-1.5 text-xs text-ink-muted">{hint}</p> : null}
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
      <Label htmlFor={inputId}>{label}</Label>
      <textarea id={inputId} rows={4} className={controlClassName} {...props} />
      {hint ? <p className="mt-1.5 text-xs text-ink-muted">{hint}</p> : null}
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
    error: "bg-danger-100 text-danger-600 border-danger-600/20",
    success: "bg-success-100 text-success-600 border-success-600/20",
    info: "bg-brand-50 text-brand-700 border-brand-500/20",
  } as const;

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2.5 text-sm ${tones[tone]}`}
    >
      {children}
    </p>
  );
}
