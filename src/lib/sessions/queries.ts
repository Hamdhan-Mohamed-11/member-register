import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type SessionSummary = {
  id: string;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  heldAt: string;
  location: string | null;
  notes: string | null;
  videoUrl: string | null;
  status: "scheduled" | "completed" | "cancelled";
  pricingKind: "free" | "paid";
  guestFeeLkr: number | null;
  capacity: number | null;
  hostClub: { id: string; name: string } | null;
  presenter: { id: string; firstName: string; lastName: string } | null;
  /**
   * Whether the session has already happened, resolved at FETCH time.
   *
   * Deliberately not computed in a component: "now" is impure, and React's
   * purity rule is right to flag it during render. It is a property of the
   * data as of this request, which is exactly what a query layer is for.
   */
  isPast: boolean;
};

type RawSession = {
  id: string;
  title: string;
  book_title: string;
  book_author: string;
  held_at: string;
  location: string | null;
  notes: string | null;
  video_url: string | null;
  status: string;
  pricing_kind: string;
  guest_fee_lkr: number | null;
  capacity: number | null;
  host_club_id: string;
  clubs: { id: string; name: string } | null;
  presenter: { id: string; first_name: string; last_name: string } | null;
};

// sessions has two FKs into profiles-adjacent tables, and one into clubs. The
// presenter embed is disambiguated by constraint name for the same reason the
// join-requests page needs it -- a bare embed would be ambiguous the moment a
// second profiles FK is added.
const SESSION_SELECT = `
  id, title, book_title, book_author, held_at, location, notes, video_url,
  status, pricing_kind, guest_fee_lkr, capacity, host_club_id,
  clubs ( id, name ),
  presenter:profiles!sessions_presenter_member_id_fkey ( id, first_name, last_name )
`;

function toSummary(raw: RawSession, now: number): SessionSummary {
  return {
    isPast: new Date(raw.held_at).getTime() < now,
    id: raw.id,
    title: raw.title,
    bookTitle: raw.book_title,
    bookAuthor: raw.book_author,
    heldAt: raw.held_at,
    location: raw.location,
    notes: raw.notes,
    videoUrl: raw.video_url,
    status: raw.status as SessionSummary["status"],
    pricingKind: raw.pricing_kind as SessionSummary["pricingKind"],
    guestFeeLkr: raw.guest_fee_lkr,
    capacity: raw.capacity,
    hostClub: raw.clubs ? { id: raw.clubs.id, name: raw.clubs.name } : null,
    presenter: raw.presenter
      ? {
          id: raw.presenter.id,
          firstName: raw.presenter.first_name,
          lastName: raw.presenter.last_name,
        }
      : null,
  };
}

export async function listSessions(): Promise<SessionSummary[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .neq("status", "cancelled")
    .order("held_at", { ascending: false });

  const now = Date.now();
  return ((data ?? []) as unknown as RawSession[]).map((r) => toSummary(r, now));
}

export async function listAllSessions(): Promise<SessionSummary[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .order("held_at", { ascending: false });

  const now = Date.now();
  return ((data ?? []) as unknown as RawSession[]).map((r) => toSummary(r, now));
}

export async function getSession(id: string): Promise<SessionSummary | null> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("id", id)
    .maybeSingle();

  return data ? toSummary(data as unknown as RawSession, Date.now()) : null;
}

/**
 * What THIS member would pay for this session.
 *
 * Always ask the database -- session_fee_for() knows the host-club rule and is
 * the same function book_session() uses, so the number shown and the number
 * charged cannot diverge.
 */
export async function feeForMember(
  sessionId: string,
  memberId: string,
): Promise<number> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.rpc("session_fee_for", {
    p_session_id: sessionId,
    p_member_id: memberId,
  });
  return Number(data ?? 0);
}

export type MyBooking = {
  id: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "refunded";
  feeLkr: number;
};

export async function myBooking(
  sessionId: string,
  memberId: string,
): Promise<MyBooking | null> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("session_bookings")
    .select("id, status, fee_lkr")
    .eq("session_id", sessionId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    status: data.status as MyBooking["status"],
    feeLkr: Number(data.fee_lkr),
  };
}

export type ActivityEntry = {
  id: string;
  code: string;
  label: string;
  points: number;
  recordedAt: string;
  session: { id: string; title: string; heldAt: string } | null;
};

/** The ledger behind a member's balance -- what earned what, and when. */
export async function myActivities(memberId: string): Promise<ActivityEntry[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("member_activities")
    .select(
      `id, activity_code, points_awarded, recorded_at,
       points_rules ( label ),
       sessions ( id, title, held_at )`,
    )
    .eq("member_id", memberId)
    .order("recorded_at", { ascending: false });

  type Raw = {
    id: string;
    activity_code: string;
    points_awarded: number;
    recorded_at: string;
    points_rules: { label: string } | null;
    sessions: { id: string; title: string; held_at: string } | null;
  };

  return ((data ?? []) as unknown as Raw[]).map((a) => ({
    id: a.id,
    code: a.activity_code,
    label: a.points_rules?.label ?? a.activity_code,
    points: a.points_awarded,
    recordedAt: a.recorded_at,
    session: a.sessions
      ? { id: a.sessions.id, title: a.sessions.title, heldAt: a.sessions.held_at }
      : null,
  }));
}
