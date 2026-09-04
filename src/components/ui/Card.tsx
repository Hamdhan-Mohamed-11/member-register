import type { ReactNode } from "react";

/**
 * The surface everything sits on.
 *
 * A hairline border plus a light warm shadow, rather than shadow alone: on a
 * warm background a pure shadow reads as muddy, while a border keeps the edge
 * crisp at any zoom level and on low-quality screens.
 */
export type CardTone = "surface" | "cream" | "brand" | "warning" | "danger";

/**
 * Backgrounds have to be a PROP, not something a caller passes through
 * `className`. `bg-cream` and the default `bg-surface` are both plain
 * background-color utilities with identical specificity, so which one wins
 * comes down to their order in the generated stylesheet -- and `bg-surface`
 * does win, which is how the feed's hero card silently rendered white after
 * being written as `<Card className="bg-cream">`.
 */
const tones: Record<CardTone, string> = {
  surface: "bg-surface border-line",
  cream: "bg-cream border-cream-deep",
  brand: "bg-brand-50 border-brand-200",
  warning: "bg-warning-100/50 border-warning-600/25",
  danger: "bg-danger-100/50 border-danger-600/25",
};

export function Card({
  children,
  className = "",
  flush = false,
  interactive = false,
  tone = "surface",
}: {
  children: ReactNode;
  className?: string;
  /** Remove the padding, for cards whose children manage their own. */
  flush?: boolean;
  /**
   * For a card that is itself a link or button. Only set this when the WHOLE
   * card is one target -- a lift on a card containing several separate links
   * promises a click that does nothing.
   */
  interactive?: boolean;
  tone?: CardTone;
}) {
  return (
    <div
      className={`border rounded-card shadow-card ${tones[tone]} ${
        flush ? "" : "p-4 sm:p-5"
      } ${
        interactive
          ? "transition-[box-shadow,border-color,transform] duration-150 hover:shadow-raised hover:border-line-strong hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="font-display text-lg text-ink leading-tight">{title}</h2>
        {description ? (
          <p className="text-sm text-ink-muted mt-0.5">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * A labelled number. The feed and the admin dashboard were each hand-rolling
 * this with different type sizes, which made the same figure look more
 * important on one page than the other.
 */
export function Stat({
  value,
  label,
  tone = "brand",
}: {
  value: ReactNode;
  label: string;
  tone?: "brand" | "ink";
}) {
  return (
    <div className="min-w-0">
      <p
        className={`font-display text-2xl leading-none tabular-nums ${
          tone === "brand" ? "text-brand-600" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs uppercase tracking-wide text-ink-faint">{label}</p>
    </div>
  );
}
