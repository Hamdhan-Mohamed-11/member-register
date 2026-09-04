import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { accountItemsFor } from "./accountItems";

/**
 * The same account destinations as the avatar dropdown, as a tappable list for
 * /me.
 *
 * Both exist deliberately. The dropdown is the fast path from any page; this is
 * the one that is *discoverable*, because a menu behind an avatar is something
 * you have to already know is there. On a phone the profile page is where
 * people go looking for their own things.
 *
 * Sign out is not in the list -- it is a POST, and it is destructive enough to
 * want separating from the row of ordinary links rather than sitting one
 * mis-tap away from "My points".
 */
export function AccountList({
  isAdmin,
  pointsBalance,
  videoCount,
}: {
  isAdmin: boolean;
  pointsBalance: number;
  videoCount?: number;
}) {
  const items = accountItemsFor(isAdmin);

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="flex items-center gap-3 px-4 min-h-14 text-sm transition-colors hover:bg-canvas"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas-deep text-ink-muted">
              <Icon name={item.icon} className="size-[18px]" />
            </span>

            <span className="flex-1 font-medium text-ink">{item.label}</span>

            {item.hint === "points" ? (
              <span className="text-sm font-semibold text-brand-600 tabular-nums">
                {pointsBalance}
              </span>
            ) : null}
            {item.hint === "videos" && videoCount !== undefined ? (
              <span className="text-sm text-ink-muted tabular-nums">{videoCount}</span>
            ) : null}

            <Icon name="chevron-right" className="size-4 shrink-0 text-ink-faint" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
