import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type MemberRole = "member" | "secretary" | "super_admin";
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
       )`,
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

export async function requireSecretary(): Promise<SessionMember> {
  const member = await requireMember();
  if (member.role !== "secretary" && member.role !== "super_admin") {
    redirect("/feed");
  }
  return member;
}

export async function requireSuperAdmin(): Promise<SessionMember> {
  const member = await requireMember();
  if (member.role !== "super_admin") redirect("/feed");
  return member;
}

export function isAdmin(member: SessionMember): boolean {
  return member.role === "secretary" || member.role === "super_admin";
}

export function fullName(member: {
  firstName: string;
  lastName: string;
  email: string;
}): string {
  const name = `${member.firstName} ${member.lastName}`.trim();
  return name || member.email;
}
