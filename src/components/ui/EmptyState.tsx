import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Shown wherever a list has nothing in it.
 *
 * The icon is not decoration: an empty panel of centred text reads as a page
 * that failed to load, and a mark at the top of it reads as a state the design
 * anticipated. It is `aria-hidden` inside `Icon`, so nothing is announced twice.
 */
export function EmptyState({
  title,
  description,
  action,
  icon = "inbox",
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: IconName;
  /**
   * For an empty list inside a card that already has other content, where the
   * full-height version leaves a third of the screen blank -- the profile page
   * stacked two of them and read as a broken page.
   */
  compact?: boolean;
}) {
  return (
    <div className={`text-center px-4 ${compact ? "py-7" : "py-12"}`}>
      <span
        className={`mx-auto grid place-items-center rounded-full bg-canvas-deep text-ink-faint ${
          compact ? "mb-2.5 size-10" : "mb-3 size-12"
        }`}
      >
        <Icon name={icon} className={compact ? "size-5" : "size-6"} />
      </span>
      <p className={`font-display text-ink ${compact ? "text-lg" : "text-xl"}`}>
        {title}
      </p>
      {description ? (
        <p className="text-sm text-ink-muted mt-1.5 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
