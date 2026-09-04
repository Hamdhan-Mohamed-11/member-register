import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";
import { getSessionMember, isAdmin } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";

/**
 * The signed-in chrome.
 *
 * It now reads the session ITSELF rather than taking a member prop. Both
 * `getSessionMember` and `getUnreadNotificationCount` are request-`cache`d, so
 * this still costs one lookup per request no matter how many components ask --
 * and thirty-odd pages no longer each hand-assemble the same three fields.
 *
 * That hand-assembly was already drifting: /feed passed `avatarUrl: null`
 * outright, so the top bar showed initials on the home page and a photo
 * everywhere else.
 *
 * pb-24 on <main> reserves room for the fixed mobile bottom bar; without it the
 * last card on every page sits underneath the nav.
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
   * /login, /join, the auth callbacks, the holding page. Someone who is
   * already signed in can still reach those, and offering them the full member
   * nav there is a distraction at best.
   */
  signedOut?: boolean;
}) {
  const session = signedOut ? null : await getSessionMember();

  // Only an ACTIVE member gets member chrome. A pending or suspended account
  // has a session but nothing the nav points at, and every link would bounce
  // them straight back to /pending.
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

  const unread = member ? await getUnreadNotificationCount() : 0;

  return (
    <>
      <TopBar member={member} unreadNotifications={unread} />
      <main
        className={`flex-1 mx-auto w-full px-4 py-5 pb-24 sm:px-6 md:pb-10 ${
          wide ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        {children}
      </main>
      {member ? <BottomNav /> : null}
    </>
  );
}
