import type { ReactNode } from "react";

/**
 * The surface everything sits on.
 *
 * A hairline border plus a light warm shadow, rather than shadow alone: on a
 * warm background a pure shadow reads as muddy, while a border keeps the edge
 * crisp at any zoom level and on low-quality screens.
 */
export function Card({
  children,
  className = "",
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  /** Remove the padding, for cards whose children manage their own. */
  flush?: boolean;
}) {
  return (
    <div
      className={`bg-surface border border-line rounded-card shadow-card ${
        flush ? "" : "p-4"
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
