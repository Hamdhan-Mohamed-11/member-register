import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * The bell, with its unread badge.
 *
 * A link to /notifications rather than a dropdown panel. A panel would have to
 * fetch the list from the client -- a second data path, a loading state, and a
 * skeleton -- to show the same rows the page already renders on the server for
 * free. The page also gives notifications a URL, which a panel cannot.
 */
export function NotificationBell({ unread }: { unread: number }) {
  // Past 99 the exact number stops being information and starts being noise.
  const label = unread > 99 ? "99+" : String(unread);

  return (
    <Link
      href="/notifications"
      className="relative grid size-10 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-deep hover:text-ink"
    >
      <Icon name="bell" className="size-[22px]" />

      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-danger-600 text-white text-[10px] font-semibold tabular-nums leading-none ring-2 ring-surface"
        >
          {label}
        </span>
      ) : null}

      {/*
        The visible badge is a bare number, which read aloud on its own ("3")
        says nothing. The accessible name carries the whole sentence instead,
        and `role="status"` announces it when the count changes without
        stealing focus from whatever the member was doing.
      */}
      <span role="status" aria-atomic="true" className="sr-only">
        {unread === 0
          ? "Notifications"
          : `Notifications, ${unread} unread`}
      </span>
    </Link>
  );
}
