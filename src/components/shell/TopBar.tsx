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
  variant = "member",
}: {
  member: TopBarMember | null;
  unreadNotifications?: number;
  /**
   * `admin` drops the member links. Inside the admin area they are the wrong
   * five destinations, and the admin sidebar already carries the right ones --
   * showing both would give every admin page two competing navigations.
   */
  variant?: "member" | "admin";
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-line">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
        <Link
          href={variant === "admin" ? "/admin" : member ? "/feed" : "/"}
          className="shrink-0 rounded-lg py-1"
          aria-label={variant === "admin" ? "Admin dashboard" : "Pick a Book — home"}
        >
          <Logo className="h-9 w-auto sm:h-11" preload />
        </Link>

        {variant === "admin" ? (
          <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-700">
            Admin
          </span>
        ) : null}

        {member ? (
          <>
            {/* Desktop links. On mobile these live in the bottom bar instead.
                Not in the admin area, which has its own sidebar. */}
            <nav
              aria-label="Primary"
              className={variant === "admin" ? "hidden" : "hidden md:block ml-3"}
            >
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
