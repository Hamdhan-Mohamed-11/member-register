import "server-only";

import { cache } from "react";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

/**
 * The kinds the database can emit. Kept in step with the check constraint in
 * `supabase/migrations/0019_notifications.sql` -- but the UI never *depends* on
 * the list being complete: an unknown kind still renders, with the neutral
 * icon. A new notification kind must never be able to blank the bell.
 */
export type NotificationKind =
  | "video.approved"
  | "video.rejected"
  | "join.approved"
  | "join.rejected"
  | "payment.received"
  | "points.awarded"
  | "membership.added"
  | "membership.changed"
  | "role.changed"
  | "account.status";

export type Notification = {
  id: string;
  kind: NotificationKind | (string & {});
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

/**
 * The bell's badge. Runs on every signed-in page render, so it is a `head`
 * count with no rows fetched and no ordering -- and it is `cache`d, because
 * AppShell and the notifications page both want it within one request.
 *
 * Capped at 99 in the UI, but counted exactly here: `count: "exact"` on a
 * partial-indexed predicate is cheap, and an approximate count that said "0"
 * when something was waiting would be worse than no badge at all.
 */
export const getUnreadNotificationCount = cache(async (): Promise<number> => {
  const supabase = await getServerComponentSupabase();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  // A failed count must not take the whole page down with it. No badge is a
  // fine degradation; a 500 on every page because the bell could not count is
  // not.
  if (error) return 0;
  return count ?? 0;
});

/**
 * Newest first. RLS restricts this to the caller's own rows, so there is no
 * member filter here -- adding one would imply the filter is what protects
 * them, and invite someone to "fix" a bug by removing it.
 */
export async function listNotifications(limit = 50): Promise<Notification[]> {
  const supabase = await getServerComponentSupabase();

  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, href, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}
