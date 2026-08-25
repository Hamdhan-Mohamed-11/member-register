import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { requireSecretary } from "@/lib/auth/session";
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
  const admin = await requireSecretary();
  const { id } = await params;

  const session = await getSession(id);
  if (!session || !session.hostClub) notFound();

  const supabase = await getServerComponentSupabase();

  const [{ data: rulesData }, { data: hostRows }, { data: bookingRows }, { data: activityRows }] =
    await Promise.all([
      supabase
        .from("points_rules")
        .select("code, label, points")
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

  const rules = (rulesData ?? []) as Rule[];

  return (
    <AppShell
      member={{
        firstName: admin.firstName,
        lastName: admin.lastName,
        avatarUrl: avatarUrl(admin.userId, admin.avatarPath),
      }}
    >
      <div className="mb-3">
        <Link
          href={`/admin/sessions/${id}`}
          className="text-sm text-brand-600 hover:underline"
        >
          ← Session
        </Link>
        <h1 className="text-2xl font-semibold text-ink mt-1">{session.title}</h1>
        <p className="text-sm text-ink-muted">
          {formatWhen(session.heldAt)} · {session.hostClub.name}
        </p>
      </div>

      <AttendanceRecorder sessionId={id} rules={rules} roster={roster} />
    </AppShell>
  );
}
