import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10 px-4">
      <p className="font-display text-xl text-ink">{title}</p>
      {description ? (
        <p className="text-sm text-ink-muted mt-1 max-w-sm mx-auto">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
