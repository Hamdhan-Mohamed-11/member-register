import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { canAdminClub, requireStaff } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getSession } from "@/lib/sessions/queries";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { formatWhen } from "@/components/sessions/SessionCard";
import {
  AttendanceRecorder,
  type RosterMember,
  type Rule,
} from "./AttendanceRecorder";

export const metadata: Metadata = { title: "Record attendance" };

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await requireStaff();
  const { id } = await params;

  const session = await getSession(id);
  if (!session || !session.hostClub) notFound();

  // The recorder for someone else's club. record_session_attendance refuses it
  // anyway, but a secretary should not be able to open a roster of members
  // they have no business seeing, let alone tick boxes for twenty minutes and
  // find out on save.
  if (!canAdminClub(member, session.hostClub.id)) notFound();

  const supabase = await getServerComponentSupabase();

  const [{ data: rulesData }, { data: hostRows }, { data: bookingRows }, { data: activityRows }] =
    await Promise.all([
      supabase
        .from("points_rules")
        .select("code, label, points, is_presenting")
        .eq("is_active", true)
        .order("points", { ascending: false }),

      // Everyone in the host club...
      supabase
        .from("club_memberships")
        .select(
          `member_id,
           profiles ( id, first_name, last_name, avatar_path,
                      club_memberships ( status, clubs ( name ) ) )`,
        )
        .eq("club_id", session.hostClub.id)
        .eq("status", "active"),

      // ...plus anyone who booked a place, who may be from another club.
      supabase
        .from("session_bookings")
        .select(
          `member_id, status,
           profiles ( id, first_name, last_name, avatar_path,
                      club_memberships ( status, clubs ( name ) ) )`,
        )
        .eq("session_id", id)
        .in("status", ["pending_payment", "confirmed"]),

      supabase
        .from("member_activities")
        .select("member_id, activity_code")
        .eq("session_id", id),
    ]);

  // Who explicitly cancelled their place. A host-club member is on the roster
  // by default whether or not they booked -- they attend free -- so without
  // this, cancelling changed nothing here and their name stayed on the list.
  const { data: cancelledRows } = await supabase
    .from("session_bookings")
    .select("member_id")
    .eq("session_id", id)
    .eq("status", "cancelled");
  const cancelled = new Set(
    ((cancelledRows ?? []) as { member_id: string }[]).map((r) => r.member_id),
  );

  type RawProfile = {
    id: string;
    first_name: string;
    last_name: string;
    avatar_path: string | null;
    club_memberships: { status: string; clubs: { name: string } | null }[] | null;
  };

  const existing = new Map<string, string[]>();
  for (const row of activityRows ?? []) {
    const list = existing.get(row.member_id) ?? [];
    list.push(row.activity_code);
    existing.set(row.member_id, list);
  }

  // Host-club members first, then guests -- de-duplicated, because a guest who
  // is also in the host club would otherwise appear twice.
  const seen = new Set<string>();
  const roster: RosterMember[] = [];

  function add(profile: RawProfile | null, isGuest: boolean) {
    if (!profile || seen.has(profile.id)) return;
    seen.add(profile.id);
    roster.push({
      id: profile.id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      avatarUrl: avatarUrl(profile.id, profile.avatar_path),
      clubNames: (profile.club_memberships ?? [])
        .filter((m) => m.status === "active" && m.clubs)
        .map((m) => m.clubs!.name),
      isGuest,
      codes: existing.get(profile.id) ?? [],
    });
  }

  for (const row of hostRows ?? []) {
    add(row.profiles as unknown as RawProfile, false);
  }
  for (const row of bookingRows ?? []) {
    add(row.profiles as unknown as RawProfile, true);
  }

  roster.sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
  );

  // Split out anyone who cancelled -- UNLESS they already have attendance
  // recorded, which means they turned up after all and belong on the list.
  const expected = roster.filter((m) => !cancelled.has(m.id) || m.codes.length > 0);
  const withdrawn = roster.filter((m) => cancelled.has(m.id) && m.codes.length === 0);

  const rules = (rulesData ?? []) as Rule[];

  return (
    <AdminShell>
      <div className="mb-3">
        <BackLink href={`/admin/sessions/${id}`}>Session</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1 page-title">{session.title}</h1>
        <p className="text-sm text-ink-muted">
          {formatWhen(session.heldAt)} · {session.hostClub.name}
        </p>
      </div>

      {/* Points are a record of an evening that happened. The RPC refuses to
          write them early; saying so here stops anyone filling the form first
          and losing the work. */}
      {!session.isPast ? (
        <Card tone="warning" className="mb-4">
          <p className="text-sm text-ink">
            This session has not happened yet. Attendance and points can be recorded
            from {formatWhen(session.heldAt)}.
          </p>
        </Card>
      ) : (
      <AttendanceRecorder
        sessionId={id}
        rules={rules}
        roster={expected}
        withdrawn={withdrawn}
        presenterCap={session.presenterCount}
      />
      )}
    </AdminShell>
  );
}
