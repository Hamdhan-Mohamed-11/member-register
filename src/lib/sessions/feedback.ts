import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type FeedbackKind = "session" | "presenter";

export type MyFeedback = { kind: FeedbackKind; rating: number; comment: string | null };

/** What this member has already said about a session, so the form comes back filled in. */
export async function getMyFeedback(sessionId: string): Promise<MyFeedback[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("session_feedback")
    .select("kind, rating, comment")
    .eq("session_id", sessionId);

  return ((data ?? []) as unknown as MyFeedback[]).map((r) => ({
    kind: r.kind,
    rating: r.rating,
    comment: r.comment,
  }));
}

/**
 * Whether this member may give feedback: the club recorded them as attending.
 * Read through their own client, so it answers for the caller only.
 */
export async function attendedSession(sessionId: string): Promise<boolean> {
  const supabase = await getServerComponentSupabase();
  const { count } = await supabase
    .from("member_activities")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("activity_code", "attend");
  return (count ?? 0) > 0;
}

export type AnonymousFeedback = { rating: number; comment: string | null; createdAt: string };

/** The presenter's own feedback for one session, without names. */
export async function getPresenterFeedback(sessionId: string): Promise<AnonymousFeedback[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.rpc("presenter_feedback", { p_session_id: sessionId });
  return ((data ?? []) as unknown as { rating: number; comment: string | null; created_at: string }[]).map(
    (r) => ({ rating: r.rating, comment: r.comment, createdAt: r.created_at }),
  );
}

export type PresenterFeedbackRow = AnonymousFeedback & {
  sessionId: string;
  title: string;
  heldAt: string;
};

/** Everything a presenter has been told, across all their sessions. */
export async function getMyPresenterFeedback(): Promise<PresenterFeedbackRow[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.rpc("my_presenter_feedback");
  return (
    (data ?? []) as unknown as {
      session_id: string;
      title: string;
      held_at: string;
      rating: number;
      comment: string | null;
      created_at: string;
    }[]
  ).map((r) => ({
    sessionId: r.session_id,
    title: r.title,
    heldAt: r.held_at,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}

export type AdminFeedbackRow = AnonymousFeedback & {
  kind: FeedbackKind;
  member: { id: string; firstName: string; lastName: string } | null;
};

/**
 * Both kinds of feedback on a session, with names, for the club's admin. RLS
 * returns nothing to anyone else, so this is safe to call from a page that a
 * secretary can also open -- they simply see an empty list.
 */
export async function getSessionFeedback(sessionId: string): Promise<AdminFeedbackRow[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("session_feedback")
    .select("kind, rating, comment, created_at, profiles ( id, first_name, last_name )")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  return (
    (data ?? []) as unknown as {
      kind: FeedbackKind;
      rating: number;
      comment: string | null;
      created_at: string;
      profiles: { id: string; first_name: string; last_name: string } | null;
    }[]
  ).map((r) => ({
    kind: r.kind,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    member: r.profiles
      ? { id: r.profiles.id, firstName: r.profiles.first_name, lastName: r.profiles.last_name }
      : null,
  }));
}

/** Mean rating, to one decimal, or null when nobody has answered. */
export function averageRating(rows: { rating: number }[]): number | null {
  if (rows.length === 0) return null;
  return Math.round((rows.reduce((n, r) => n + r.rating, 0) / rows.length) * 10) / 10;
}
