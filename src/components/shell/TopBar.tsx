"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClassName } from "@/components/ui/Button";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { MEMBER_NAV, isActive } from "./navItems";

export type TopBarMember = {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  pointsBalance: number;
  isAdmin: boolean;
};

export function TopBar({
  member,
  unreadNotifications = 0,
}: {
  member: TopBarMember | null;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-line">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
        <Link
          href={member ? "/feed" : "/"}
          className="shrink-0 rounded-lg py-1"
          aria-label="Pick a Book — home"
        >
          <Logo className="h-9 w-auto sm:h-11" preload />
        </Link>

        {member ? (
          <>
            {/* Desktop links. On mobile these live in the bottom bar instead. */}
            <nav aria-label="Primary" className="hidden md:block ml-3">
              <ul className="flex items-center gap-1">
                {MEMBER_NAV.map((item) => {
                  const active = isActive(item, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`relative inline-flex items-center min-h-9 px-3 rounded-lg text-sm transition-colors ${
                          active
                            ? "bg-brand-50 text-brand-700 font-medium"
                            : "text-ink-muted hover:bg-canvas-deep hover:text-ink"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="ml-auto flex items-center gap-1">
              <NotificationBell unread={unreadNotifications} />
              <AccountMenu member={member} />
            </div>
          </>
        ) : pathname === "/login" ? null : (
          // No "Log in" button on the log-in page. It was rendering a primary
          // button that navigates to the page you are already on, one line
          // above a form headed "Welcome back".
          <Link
            href="/login"
            className={`${buttonClassName("primary", "sm")} ml-auto`}
          >
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
