import type { ReactNode } from "react";
import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { getSessionMember, isCreator } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";

/**
 * The chrome for everything under /creator.
 *
 * An author's portal is a short list: their books, what those have sold, and
 * -- for a publisher -- the authors on their list. That is too little for the
 * admin sidebar and nothing like a member's week, so it gets its own frame
 * with a row of tabs and no bottom bar.
 */
export async function CreatorShell({
  children,
  tabs = true,
}: {
  children: ReactNode;
  /** Off for the pages that are about becoming a creator in the first place. */
  tabs?: boolean;
}) {
  // Signed out is allowed: /creator/register is where an author who has no
  // account yet starts, and bouncing them to /login would send them to a club
  // signup they cannot complete.
  const session = await getSessionMember();
  const unread = session && isCreator(session) ? await getUnreadNotificationCount() : 0;

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        variant="admin"
        member={
          session
            ? {
                firstName: session.firstName,
                lastName: session.lastName,
                email: session.email,
                avatarUrl: avatarUrl(session.userId, session.avatarPath),
                pointsBalance: 0,
                isAdmin: false,
              }
            : null
        }
        unreadNotifications={unread}
      />

      {tabs && session ? (
        <nav className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 sm:px-6">
            <Tab href="/creator">My books</Tab>
            {session?.role === "publisher" ? (
              <Tab href="/creator/authors">My authors</Tab>
            ) : null}
            <Tab href="/creator/books/new">Submit a book</Tab>
          </div>
        </nav>
      ) : null}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-12 sm:px-6 lg:py-7">
        {children}
      </main>
    </div>
  );
}

function Tab({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="press -mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium text-ink-muted hover:border-line-strong hover:text-ink"
    >
      {children}
    </Link>
  );
}
