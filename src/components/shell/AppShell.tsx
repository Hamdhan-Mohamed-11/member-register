import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { MemberSidebar } from "./MemberSidebar";
import { TopBar } from "./TopBar";
import { getSessionMember, isAdmin, activeMemberships } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";
import { getCartCount } from "@/lib/orders/queries";

/**
 * The member chrome.
 *
 * Desktop: a full-height sidebar on the left, and the top bar plus the page in
 * a column beside it. That replaced a centred column with empty margins either
 * side (review items 2 and "fill the blank space"), and gives every section a
 * place in the navigation.
 *
 * Phone: no sidebar -- the top bar carries the logo, and the bottom bar carries
 * the five main sections. pb-24 on <main> reserves room for that bar, without
 * which the last card on every page sits underneath it.
 *
 * Reads the session itself; `getSessionMember`, the unread count and the cart
 * count are all request-`cache`d, so this is one lookup each per request no
 * matter how many components ask.
 */
export async function AppShell({
  children,
  wide = false,
  signedOut = false,
}: {
  children: ReactNode;
  /** Wider container for marketing pages; app pages keep the reading width. */
  wide?: boolean;
  /**
   * Force the logged-out chrome. For pages that are *about* signing in --
   * /login, /join, the auth callbacks, the holding page.
   */
  signedOut?: boolean;
}) {
  const session = signedOut ? null : await getSessionMember();

  // Only an ACTIVE member gets member chrome. A pending or suspended account
  // has a session but nothing the nav points at.
  const member =
    session && session.status === "active"
      ? {
          firstName: session.firstName,
          lastName: session.lastName,
          email: session.email,
          avatarUrl: avatarUrl(session.userId, session.avatarPath),
          pointsBalance: session.pointsBalance,
          isAdmin: isAdmin(session),
        }
      : null;

  if (!member) {
    return (
      <>
        <TopBar member={null} />
        <main
          className={`mx-auto w-full flex-1 px-4 py-5 sm:px-6 md:pb-10 ${
            wide ? "max-w-6xl" : "max-w-5xl"
          }`}
        >
          {children}
        </main>
      </>
    );
  }

  const [unread, cartCount] = await Promise.all([
    getUnreadNotificationCount(),
    getCartCount(),
  ]);

  const primary = session ? activeMemberships(session).find((c) => c.isPrimary) : null;
  const clubName =
    primary?.clubName ?? (session ? activeMemberships(session)[0]?.clubName : null) ?? null;

  return (
    <div className="flex min-h-screen">
      <MemberSidebar member={member} clubName={clubName} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar member={member} unreadNotifications={unread} cartCount={cartCount} />
        <main
          className={`mx-auto w-full min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-7 lg:pb-10 ${
            wide ? "max-w-6xl" : "max-w-5xl"
          }`}
        >
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
