import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/shell/TopBar";
import { AdminNav } from "./AdminNav";
import { getSessionMember, isAdmin } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";

/**
 * The chrome for everything under /admin.
 *
 * Separate from AppShell because the admin area is a different product for a
 * different job. AppShell's frame is built around a member's week -- reading,
 * sessions, books, the people in their club -- and its bottom bar puts those
 * five destinations under the thumb. Someone running a club needs a queue of
 * things to act on and the tools to act, and sending them through a member's
 * navigation to get there made the admin area feel like a settings page
 * bolted onto somebody else's app.
 *
 * So: the same top bar minus the member links, a sidebar of admin sections,
 * and no member bottom bar at all. The member site stays one link away.
 */
export async function AdminShell({ children }: { children: ReactNode }) {
  const session = await getSessionMember();

  // The pages each re-check with requireSecretary() / requireSuperAdmin(),
  // which are the real gates. This only avoids drawing admin chrome for
  // someone about to be redirected anyway.
  if (!session || session.status !== "active" || !isAdmin(session)) {
    redirect("/feed");
  }

  const isSuper = session.role === "super_admin";
  const unread = await getUnreadNotificationCount();

  return (
    <>
      <TopBar
        variant="admin"
        member={{
          firstName: session.firstName,
          lastName: session.lastName,
          email: session.email,
          avatarUrl: avatarUrl(session.userId, session.avatarPath),
          pointsBalance: session.pointsBalance,
          isAdmin: true,
        }}
        unreadNotifications={unread}
      />

      <div className="flex flex-1 flex-col lg:flex-row">
        <AdminNav
          isSuper={isSuper}
          roleLabel={isSuper ? "Super admin" : "Secretary"}
          clubName={isSuper ? null : session.secretaryClubName}
        />

        <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-5 pb-12 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </>
  );
}
