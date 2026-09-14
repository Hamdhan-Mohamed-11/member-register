import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type DashboardStats = {
  activeMembers: number;
  newMembersThisMonth: number;
  pendingJoinRequests: number;
  upcomingSessions: number;
  sessionsThisMonth: number;
  attendanceThisMonth: number;
  videosAwaitingReview: number;
  discoverPosts: number;
  /** Super admin only; null for a secretary. */
  ordersNeedingPrice: number | null;
  ordersToHandOver: number | null;
  overdueBorrows: number | null;
  borrowsWaiting: number | null;
  paymentsThisMonthLkr: number | null;
  readriseLkr: number | null;
};

export type UpcomingSession = {
  id: string;
  title: string;
  heldAt: string;
  clubName: string | null;
  bookings: number;
};

export type RecentMember = {
  id: string;
  name: string;
  clubName: string | null;
  joinedOn: string;
};

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/**
 * Everything the admin dashboard shows.
 *
 * `scope` is null for a super admin and a list of club ids for a secretary --
 * adminClubScope(). Every query is scoped with it here, even though RLS would
 * also narrow most of them: for a secretary the figure has to mean "your
 * club", and a count that is RLS-narrowed on one table and not another would
 * put numbers side by side that measure different things.
 *
 * Counts use `head: true`, which returns only the count and no rows. A
 * dashboard that fetched every member to count them would get slower with
 * every member it gained.
 */
export async function getDashboard(scope: string[] | null): Promise<{
  stats: DashboardStats;
  upcoming: UpcomingSession[];
  recentMembers: RecentMember[];
}> {
  const supabase = await getServerComponentSupabase();
  const monthStart = startOfMonthIso();
  const nowIso = new Date().toISOString();
  const isSuper = scope == null;

  // A secretary with no club has nothing to count. Return zeros rather than
  // letting `.in(col, [])` produce an error or, worse, an unscoped query.
  if (scope != null && scope.length === 0) {
    return {
      stats: {
        activeMembers: 0,
        newMembersThisMonth: 0,
        pendingJoinRequests: 0,
        upcomingSessions: 0,
        sessionsThisMonth: 0,
        attendanceThisMonth: 0,
        videosAwaitingReview: 0,
        discoverPosts: 0,
        ordersNeedingPrice: null,
        ordersToHandOver: null,
        overdueBorrows: null,
        borrowsWaiting: null,
        paymentsThisMonthLkr: null,
        readriseLkr: null,
      },
      upcoming: [],
      recentMembers: [],
    };
  }

  // Each count names its table literally. A shared helper typed on a UNION of
  // table names collapses the column types to the columns every one of them
  // shares -- just `id` -- so `.eq("status", ...)` stops type-checking. Literal
  // names keep full typing, which is what catches a misspelt column.
  const HEAD = { count: "exact" as const, head: true };

  let members = supabase
    .from("club_memberships")
    .select("member_id", { count: "exact", head: true })
    .eq("status", "active");
  let newMembers = supabase
    .from("club_memberships")
    .select("member_id", { count: "exact", head: true })
    .eq("status", "active")
    .gte("joined_on", monthStart.slice(0, 10));
  let joinRequests = supabase.from("club_join_requests").select("*", HEAD).eq("status", "pending");
  let upcoming = supabase.from("sessions").select("*", HEAD).gte("held_at", nowIso).neq("status", "cancelled");
  let thisMonth = supabase.from("sessions").select("*", HEAD).gte("held_at", monthStart).lte("held_at", nowIso);
  let discover = supabase.from("discover_posts").select("*", HEAD);

  if (scope) {
    members = members.in("club_id", scope);
    newMembers = newMembers.in("club_id", scope);
    joinRequests = joinRequests.in("club_id", scope);
    upcoming = upcoming.in("host_club_id", scope);
    thisMonth = thisMonth.in("host_club_id", scope);
    discover = discover.in("club_id", scope);
  }

  // Attendance for the month goes through sessions, so it can be scoped by the
  // session's club.
  let attendanceSessions = supabase
    .from("sessions")
    .select("id")
    .gte("held_at", monthStart)
    .lte("held_at", nowIso);
  if (scope) attendanceSessions = attendanceSessions.in("host_club_id", scope);

  const [
    membersR,
    newMembersR,
    joinR,
    upcomingR,
    thisMonthR,
    discoverR,
    videosR,
    attendanceSessionsR,
  ] = await Promise.all([
    members,
    newMembers,
    joinRequests,
    upcoming,
    thisMonth,
    discover,
    supabase.from("videos").select("*", HEAD).eq("status", "pending"),
    attendanceSessions,
  ]);

  const sessionIds = ((attendanceSessionsR.data ?? []) as { id: string }[]).map((s) => s.id);
  const attendanceR = sessionIds.length
    ? await supabase
        .from("member_activities")
        .select("id", { count: "exact", head: true })
        .eq("activity_code", "attend")
        .in("session_id", sessionIds)
    : { count: 0 };

  // Central figures: a super admin's only. A secretary is not shown money,
  // orders or borrowing -- those are not one club's business, and RLS would
  // refuse most of these reads for them anyway.
  let central = {
    ordersNeedingPrice: null as number | null,
    ordersToHandOver: null as number | null,
    overdueBorrows: null as number | null,
    borrowsWaiting: null as number | null,
    paymentsThisMonthLkr: null as number | null,
    readriseLkr: null as number | null,
  };

  if (isSuper) {
    const today = new Date().toISOString().slice(0, 10);
    const [needPrice, handOver, overdue, waiting, payments, readrise] = await Promise.all([
      supabase.from("book_orders").select("*", HEAD).eq("status", "review"),
      supabase.from("book_orders").select("*", HEAD).eq("status", "paid"),
      supabase.from("borrow_requests").select("*", HEAD).eq("status", "issued").lt("due_on", today),
      supabase.from("borrow_requests").select("*", HEAD).eq("status", "requested"),
      supabase
        .from("payments")
        .select("amount_lkr")
        .in("status", ["success", "manual"])
        .gte("paid_at", monthStart),
      supabase
        .from("book_orders")
        .select("readrise_lkr")
        .in("status", ["paid", "fulfilled"]),
    ]);

    const sum = (rows: unknown, key: string) =>
      ((rows ?? []) as Record<string, number | string>[]).reduce(
        (s, r) => s + Number(r[key] ?? 0),
        0,
      );

    central = {
      ordersNeedingPrice: needPrice.count ?? 0,
      ordersToHandOver: handOver.count ?? 0,
      overdueBorrows: overdue.count ?? 0,
      borrowsWaiting: waiting.count ?? 0,
      paymentsThisMonthLkr: sum(payments.data, "amount_lkr"),
      readriseLkr: sum(readrise.data, "readrise_lkr"),
    };
  }

  // The next few sessions, with how many have booked.
  let nextQuery = supabase
    .from("sessions")
    .select("id, title, held_at, clubs ( name ), session_bookings ( status )")
    .gte("held_at", nowIso)
    .neq("status", "cancelled")
    .order("held_at")
    .limit(4);
  if (scope) nextQuery = nextQuery.in("host_club_id", scope);

  let recentQuery = supabase
    .from("club_memberships")
    .select("joined_on, clubs ( name ), profiles ( id, first_name, last_name, email )")
    .eq("status", "active")
    .order("joined_on", { ascending: false })
    .limit(5);
  if (scope) recentQuery = recentQuery.in("club_id", scope);

  const [{ data: nextRows }, { data: recentRows }] = await Promise.all([
    nextQuery,
    recentQuery,
  ]);

  type NextRow = {
    id: string;
    title: string;
    held_at: string;
    clubs: { name: string } | null;
    session_bookings: { status: string }[] | null;
  };
  type RecentRow = {
    joined_on: string;
    clubs: { name: string } | null;
    profiles: { id: string; first_name: string; last_name: string; email: string } | null;
  };

  return {
    stats: {
      activeMembers: membersR.count ?? 0,
      newMembersThisMonth: newMembersR.count ?? 0,
      pendingJoinRequests: joinR.count ?? 0,
      upcomingSessions: upcomingR.count ?? 0,
      sessionsThisMonth: thisMonthR.count ?? 0,
      attendanceThisMonth: attendanceR.count ?? 0,
      videosAwaitingReview: videosR.count ?? 0,
      discoverPosts: discoverR.count ?? 0,
      ...central,
    },
    upcoming: ((nextRows ?? []) as unknown as NextRow[]).map((r) => ({
      id: r.id,
      title: r.title,
      heldAt: r.held_at,
      clubName: r.clubs?.name ?? null,
      bookings: (r.session_bookings ?? []).filter((b) =>
        ["confirmed", "pending_payment"].includes(b.status),
      ).length,
    })),
    recentMembers: ((recentRows ?? []) as unknown as RecentRow[])
      .filter((r) => r.profiles)
      .map((r) => ({
        id: r.profiles!.id,
        name:
          `${r.profiles!.first_name} ${r.profiles!.last_name}`.trim() ||
          r.profiles!.email,
        clubName: r.clubs?.name ?? null,
        joinedOn: r.joined_on,
      })),
  };
}
