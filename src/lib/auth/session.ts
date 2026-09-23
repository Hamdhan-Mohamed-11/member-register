import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type MemberRole = "member" | "secretary" | "club_admin" | "super_admin";
export type MemberStatus = "pending" | "active" | "suspended" | "rejected";
export type ClubKind = "public" | "company";
export type MembershipStatus =
  | "pending"
  | "active"
  | "expired"
  | "cancelled"
  | "rejected";

export type ClubMembership = {
  membershipId: string;
  clubId: string;
  clubName: string;
  clubSlug: string;
  clubKind: ClubKind;
  status: MembershipStatus;
  isPrimary: boolean;
  renewalDate: string | null;
};

export type SessionMember = {
  userId: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  firstName: string;
  lastName: string;
  avatarPath: string | null;
  pointsBalance: number;
  /** Every membership, including expired ones -- the renewal UI needs those. */
  memberships: ClubMembership[];
  /**
   * The one club this member RUNS, or null.
   *
   * Not the same as being in a club: staff may run a club they are not a
   * member of, and being a member of one grants nothing administrative. This
   * mirrors clubs.admin_id for a club admin and clubs.secretary_id for a
   * secretary, and is null for a super admin -- their reach is not a club, so
   * a page asking "which club is theirs" would get the wrong answer here.
   */
  staffClubId: string | null;
  staffClubName: string | null;
};

export const getSessionMember = cache(async (): Promise<SessionMember | null> => {
  const supabase = await getServerComponentSupabase();

  // getUser(), NEVER getSession().
  //
  // getSession() only decodes the cookie locally -- it does not validate the
  // token against the Auth server, so a forged or expired cookie satisfies it.
  // getUser() verifies. Anything authorization-shaped must use getUser().
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      `id, email, role, status, first_name, last_name, avatar_path, points_balance,
       club_memberships (
         id, club_id, status, is_primary, renewal_date,
         clubs ( name, slug, kind )
       ),
       runs:clubs!clubs_secretary_id_fkey ( id, name ),
       manages:clubs!clubs_admin_id_fkey ( id, name )`,
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  type RawMembership = {
    id: string;
    club_id: string;
    status: string;
    is_primary: boolean;
    renewal_date: string | null;
    clubs: { name: string; slug: string; kind: string } | null;
  };

  const memberships: ClubMembership[] = (
    (profile.club_memberships ?? []) as unknown as RawMembership[]
  )
    .filter((m) => m.clubs !== null)
    .map((m) => ({
      membershipId: m.id,
      clubId: m.club_id,
      clubName: m.clubs!.name,
      clubSlug: m.clubs!.slug,
      clubKind: m.clubs!.kind as ClubKind,
      status: m.status as MembershipStatus,
      isPrimary: m.is_primary,
      renewalDate: m.renewal_date,
    }))
    // Primary club first, then alphabetical -- a stable order so the UI does
    // not reshuffle between renders.
    .sort((a, b) =>
      a.isPrimary === b.isPrimary
        ? a.clubName.localeCompare(b.clubName)
        : a.isPrimary
          ? -1
          : 1,
    );

  // Both embeds come back as arrays because they are reverse relations, but
  // the unique indexes on clubs.secretary_id and clubs.admin_id mean there can
  // only ever be one of each. A club admin's club wins: someone who is both
  // runs that club with the wider powers.
  const raw = profile as unknown as {
    runs?: { id: string; name: string }[] | { id: string; name: string } | null;
    manages?: { id: string; name: string }[] | { id: string; name: string } | null;
  };
  const first = (v: typeof raw.runs) => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const runsClub = first(raw.manages) ?? first(raw.runs);

  return {
    userId: profile.id,
    email: profile.email,
    role: profile.role as MemberRole,
    status: profile.status as MemberStatus,
    firstName: profile.first_name,
    lastName: profile.last_name,
    avatarPath: profile.avatar_path,
    pointsBalance: profile.points_balance,
    memberships,
    staffClubId: runsClub?.id ?? null,
    staffClubName: runsClub?.name ?? null,
  };
});

// --- membership helpers ----------------------------------------------------

export function activeMemberships(member: SessionMember): ClubMembership[] {
  return member.memberships.filter((m) => m.status === "active");
}

export function isInClub(member: SessionMember, clubId: string): boolean {
  return activeMemberships(member).some((m) => m.clubId === clubId);
}

/**
 * Soonest renewal across active clubs -- what the profile header nudges about.
 * Each club renews on its own date, so there is no single "membership expiry";
 * the nearest one is the one that needs attention first.
 */
export function nextRenewalDate(member: SessionMember): string | null {
  const dates = activeMemberships(member)
    .map((m) => m.renewalDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  return dates[0] ?? null;
}

export type MembershipState = "none" | "active" | "expiring_soon" | "expired";

export function membershipState(
  renewalDate: string | null,
  expiringSoonDays = 30,
): MembershipState {
  if (!renewalDate) return "none";
  // Compare as dates, not timestamps -- a renewal is a calendar day, and
  // comparing against `new Date()` makes "expires today" flip mid-afternoon.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${renewalDate}T00:00:00`);
  if (due < today) return "expired";
  const soon = new Date(today);
  soon.setDate(soon.getDate() + expiringSoonDays);
  return due <= soon ? "expiring_soon" : "active";
}

// --- route guards ----------------------------------------------------------

/** Signed in at all. Everything else builds on this. */
export async function requireMember(): Promise<SessionMember> {
  const member = await getSessionMember();
  if (!member) redirect("/login");
  return member;
}

/**
 * Signed in AND approved. The gate for every real member feature -- a pending
 * applicant or a suspended member gets bounced to a holding page.
 *
 * Deliberately does NOT require a live club membership: someone whose clubs
 * have all lapsed still needs to reach their profile and the renewal page.
 * Club-gated content checks `isInClub` for itself.
 */
export async function requireActiveMember(): Promise<SessionMember> {
  const member = await requireMember();
  if (member.status !== "active") redirect("/pending");
  return member;
}

/** Any staff: a secretary, a club admin, or a super admin. */
export async function requireStaff(): Promise<SessionMember> {
  const member = await requireMember();
  if (!isAdmin(member)) redirect("/feed");
  return member;
}

/**
 * Staff who decide FOR a club rather than doing its work: admitting members,
 * appointing its secretary, seeing its money. A secretary is not one.
 */
export async function requireClubManager(): Promise<SessionMember> {
  const member = await requireMember();
  if (member.role !== "club_admin" && member.role !== "super_admin") {
    redirect(isAdmin(member) ? "/admin" : "/feed");
  }
  return member;
}

export async function requireSuperAdmin(): Promise<SessionMember> {
  const member = await requireMember();
  if (member.role !== "super_admin") redirect("/feed");
  return member;
}

export function isAdmin(member: SessionMember): boolean {
  return (
    member.role === "secretary" ||
    member.role === "club_admin" ||
    member.role === "super_admin"
  );
}

/** May this member decide for this club? The twin of can_manage_club() in SQL. */
export function canManageClub(member: SessionMember, clubId: string | null): boolean {
  if (member.role === "super_admin") return true;
  return member.role === "club_admin" && clubId != null && member.staffClubId === clubId;
}

/**
 * May this member act on this club?
 *
 * The app-side twin of can_admin_club() in SQL. Use it to decide what to SHOW;
 * the database decides what may actually happen, and every RPC re-checks. A
 * page that forgets this hides nothing important -- one that relies on it as
 * the only check is wrong.
 */
export function canAdminClub(member: SessionMember, clubId: string | null): boolean {
  if (member.role === "super_admin") return true;
  return clubId != null && member.staffClubId === clubId;
}

/**
 * The clubs an admin may act on, or null meaning "all of them".
 *
 * Null rather than a list of every club id on purpose: a super admin's reach
 * is not a set that has to be kept in step with the clubs table.
 */
export function adminClubScope(member: SessionMember): string[] | null {
  if (member.role === "super_admin") return null;
  return member.staffClubId ? [member.staffClubId] : [];
}

export function fullName(member: {
  firstName: string;
  lastName: string;
  email: string;
}): string {
  const name = `${member.firstName} ${member.lastName}`.trim();
  return name || member.email;
}
