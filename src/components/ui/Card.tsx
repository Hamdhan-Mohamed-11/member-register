import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Removes the default padding, for cards whose children manage their own. */
  flush?: boolean;
};

export function Card({ flush, className = "", ...props }: CardProps) {
  return (
    <div
      className={`bg-surface rounded-card shadow-card ${flush ? "" : "p-4"} ${className}`}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  action,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="text-sm text-ink-muted mt-0.5">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
