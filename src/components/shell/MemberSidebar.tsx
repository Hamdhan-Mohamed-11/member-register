"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "./Logo";
import { SIDEBAR_NAV, isActive } from "./navItems";

/**
 * The member sidebar, desktop only.
 *
 * Replaces the row of links in the top bar at lg and up. Two reasons, both from
 * the portal review: on a wide screen the content column sat in the middle with
 * empty margins either side, and Discover and Recordings (item 14) had no room
 * in a five-link top bar. A sidebar uses the width that was going spare and
 * has room for every section, each with an icon so the list can be scanned by
 * shape.
 *
 * Full height and fixed to the viewport, with the top bar starting AFTER it
 * rather than spanning over it -- the same frame as the admin area, so the two
 * halves of the product are built the same way.
 *
 * Phones keep the bottom bar. A sidebar has no business on a 360px screen.
 */
export function MemberSidebar({
  member,
  clubName,
}: {
  member: {
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    pointsBalance: number;
  };
  clubName: string | null;
}) {
  const pathname = usePathname();
  const name = `${member.firstName} ${member.lastName}`.trim() || "Member";

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <Link
        href="/feed"
        className="flex h-16 shrink-0 items-center border-b border-line px-5"
        aria-label="Pick a Book — home"
      >
        <Logo className="h-10 w-auto" preload />
      </Link>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5">
        {clubName ? (
          <div className="rounded-card border border-cream-deep bg-cream px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-700">
              <span aria-hidden className="size-1.5 rounded-full bg-success-600" />
              Your club
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-ink">{clubName}</p>
          </div>
        ) : null}

        <nav aria-label="Primary" className="flex-1">
          <ul className="space-y-0.5">
            {SIDEBAR_NAV.map((item) => {
              const active = isActive(item, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`press relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                      active
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-ink-muted hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-600"
                      />
                    ) : null}
                    <Icon name={item.icon} className="size-[18px] shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* The member's own card, pinned to the foot. */}
        <Link
          href="/me"
          className="press flex items-center gap-3 rounded-card border border-line bg-canvas px-3 py-2.5 transition-colors hover:border-line-strong"
        >
          <Avatar
            src={member.avatarUrl}
            firstName={member.firstName}
            lastName={member.lastName}
            size="sm"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{name}</span>
            <span className="block text-xs text-gold-700 tabular-nums">
              {member.pointsBalance} points
            </span>
          </span>
        </Link>
      </div>
    </aside>
  );
}
