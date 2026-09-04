import type { ReactNode } from "react";

/**
 * The title block at the top of a page.
 *
 * Every page was rolling its own -- some an `<h1>`, some an `<h2>`, some a
 * `CardHeader` doing duty as a page title, with the spacing below it different
 * on each. That is the sort of inconsistency nobody can name but everybody
 * feels, so it lives in one component now.
 *
 * `<h1>` because this is the page's one top-level heading; `CardHeader` renders
 * `<h2>` and sits beneath it in the outline.
 */
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  /** A button or link, right-aligned and vertically centred with the title. */
  action?: ReactNode;
  /** Small label above the title -- a section name or a back-context. */
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 ${className}`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-700 mb-1">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl sm:text-[1.75rem] leading-tight text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-ink-muted max-w-prose">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
