"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClassName } from "@/components/ui/Button";
import { AccountMenu } from "./AccountMenu";
import { CartButton } from "./CartButton";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";

export type TopBarMember = {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  pointsBalance: number;
  isAdmin: boolean;
  /** A secretary looking at their club as a member. */
  memberView?: boolean;
  /** An author or a publisher: a different portal, a different menu. */
  isCreator?: boolean;
};

/**
 * The bar across the top.
 *
 * Signed in, it sits BESIDE a full-height sidebar on desktop rather than
 * spanning over it (review item 21), so at lg and up it carries only the
 * actions -- bell, cart, account -- and leaves the logo and the section links
 * to the sidebar. Showing both would give every page two competing
 * navigations. On a phone the sidebar does not exist, so the logo comes back
 * and the bottom bar carries the sections.
 *
 * Signed out, it is the old centred bar: logo and a way to log in.
 */
export function TopBar({
  member,
  unreadNotifications = 0,
  cartCount = 0,
  variant = "member",
  badge,
}: {
  member: TopBarMember | null;
  unreadNotifications?: number;
  cartCount?: number;
  /**
   * `admin` drops the cart -- admins asked not to carry the member's buying
   * and borrowing -- and marks the bar so it is obvious which side you are on.
   */
  variant?: "member" | "admin";
  /** What the pill says. "Admin" unless someone else owns this frame. */
  badge?: string;
}) {
  const pathname = usePathname();

  if (!member) {
    return (
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="shrink-0 rounded-lg py-1" aria-label="Pick a Book — home">
            <Logo className="h-9 w-auto sm:h-11" preload />
          </Link>
          {pathname === "/login" ? null : (
            // No "Log in" on the log-in page: it would be a primary button
            // that navigates to the page you are already on.
            <Link href="/login" className={`${buttonClassName("primary", "sm")} ml-auto`}>
              Log in
            </Link>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* The logo only where there is no sidebar to carry it. */}
        <Link
          href={member?.isCreator ? "/creator" : variant === "admin" ? "/admin" : "/feed"}
          className="shrink-0 rounded-lg py-1 lg:hidden"
          aria-label={
            member?.isCreator
              ? "My books"
              : variant === "admin"
                ? "Admin dashboard"
                : "Pick a Book — home"
          }
        >
          <Logo className="h-9 w-auto" preload />
        </Link>

        {variant === "admin" ? (
          <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-700">
            {badge ?? "Admin"}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <NotificationBell unread={unreadNotifications} />
          {variant === "member" ? <CartButton count={cartCount} /> : null}
          <AccountMenu member={member} />
        </div>
      </div>
    </header>
  );
}
