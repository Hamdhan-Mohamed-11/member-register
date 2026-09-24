import type { ReactNode } from "react";
import { TopBar } from "@/components/shell/TopBar";
import { getSessionMember, isCreator } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";
import { getCreatorAccount } from "@/lib/creators/queries";
import { CreatorMobileNav, CreatorNav } from "./CreatorNav";

/**
 * The chrome for everything under /creator.
 *
 * The same navy frame as the admin area, not the member one: an author works
 * in the portal without belonging to a club, so a member's bottom bar of
 * feed, sessions and points would point at five places they cannot go. The
 * sidebar carries their own short list instead.
 *
 * Signed out is allowed, with no sidebar: /creator/register is where an author
 * with no account starts, and bouncing them to /login would send them to a
 * club signup they cannot complete.
 */
export async function CreatorShell({
  children,
  /** Off for the pages that are about becoming a creator in the first place. */
  nav = true,
}: {
  children: ReactNode;
  nav?: boolean;
}) {
  const session = await getSessionMember();
  const registered = session != null && isCreator(session);

  const [unread, account] = await Promise.all([
    registered ? getUnreadNotificationCount() : Promise.resolve(0),
    registered ? getCreatorAccount() : Promise.resolve(null),
  ]);

  const showNav = nav && registered;
  const navProps = {
    kind: (session?.role === "publisher" ? "publisher" : "author") as "author" | "publisher",
    name: account?.name ?? null,
    status: account?.status ?? null,
  };

  const member = session
    ? {
        firstName: session.firstName,
        lastName: session.lastName,
        email: session.email,
        avatarUrl: avatarUrl(session.userId, session.avatarPath),
        pointsBalance: 0,
        isAdmin: false,
        isCreator: registered,
      }
    : null;

  return (
    <div className="flex min-h-screen">
      {showNav ? <CreatorNav {...navProps} /> : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar variant="admin" member={member} unreadNotifications={unread} />
        {showNav ? <CreatorMobileNav {...navProps} /> : null}

        <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-5 pb-12 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
