import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { BottomNav } from "./BottomNav";
import { MemberSidebar } from "./MemberSidebar";
import { SectionTabs } from "./SectionTabs";
import { TopBar } from "./TopBar";
import { getSessionMember, isAdmin, isCreator, activeMemberships } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";
import { inMemberView } from "@/lib/auth/viewMode";
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
  allowStaff = false,
}: {
  children: ReactNode;
  /** Wider container for marketing pages; app pages keep the reading width. */
  wide?: boolean;
  /**
   * Force the logged-out chrome. For pages that are *about* signing in --
   * /login, /join, the auth callbacks, the holding page.
   */
  signedOut?: boolean;
  /**
   * Whether club staff may use this page. Secretaries and super admins work
   * in the admin area, not the member portal -- Discover, the library, the
   * cart and the rest are member things -- so by default a staff account
   * that lands on a member page is sent to the dashboard. The few pages staff
   * genuinely need (their notifications, editing their own profile, looking
   * at a member or a book an admin page linked to) opt in, and are drawn
   * inside the admin frame so nothing around them looks like the member site.
   */
  allowStaff?: boolean;
}) {
  const session = signedOut ? null : await getSessionMember();

  // A secretary who chose "View as member" sees the member portal for their
  // club; every other staff account stays in the admin frame.
  const memberView =
    session != null &&
    session.status === "active" &&
    session.role === "secretary" &&
    (await inMemberView());

  if (session && session.status === "active" && isAdmin(session) && !memberView) {
    if (!allowStaff) redirect("/admin");
    return <AdminShell>{children}</AdminShell>;
  }

  // Authors and publishers have their own portal. They are not members, so a
  // member page would show them a feed they cannot post to and a points total
  // that will always be zero.
  if (session && isCreator(session)) redirect("/creator");

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
          memberView,
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
          {member.memberView ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm">
              <span className="text-brand-700">
                You&apos;re viewing{clubName ? ` ${clubName}` : " the portal"} as a member.
              </span>
              {/* A route handler, not a page: it sets a cookie and redirects,
                  so it wants a full request rather than a client navigation. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/view/admin"
                className="font-medium text-brand-700 underline-offset-2 hover:underline"
              >
                Back to admin
              </a>
            </div>
          ) : null}
          <SectionTabs />
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
