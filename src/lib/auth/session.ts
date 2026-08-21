import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type MemberRole = "member" | "secretary" | "super_admin";
export type MemberStatus = "pending" | "active" | "suspended" | "rejected";
export type ClubKind = "public" | "company";

export type SessionMember = {
  userId: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  clubId: string | null;
  clubName: string | null;
  clubKind: ClubKind | null;
  firstName: string;
  lastName: string;
  avatarPath: string | null;
  renewalDate: string | null;
  pointsBalance: number;
};

/**
 * The one session lookup per request.
 *
 * `cache()` dedupes this across the layout, the page, and every component that
 * asks -- without it a single render does five getUser() round-trips to
 * Supabase Cloud.
 */
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
      "id, email, role, status, club_id, first_name, last_name, avatar_path, renewal_date, points_balance, clubs(name, kind)",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  // The embedded club arrives as an object (to-one) but is typed loosely by the
  // generated types when the FK is nullable.
  const club = profile.clubs as { name: string; kind: string } | null;

  return {
    userId: profile.id,
    email: profile.email,
    role: profile.role as MemberRole,
    status: profile.status as MemberStatus,
    clubId: profile.club_id,
    clubName: club?.name ?? null,
    clubKind: (club?.kind as ClubKind | undefined) ?? null,
    firstName: profile.first_name,
    lastName: profile.last_name,
    avatarPath: profile.avatar_path,
    renewalDate: profile.renewal_date,
    pointsBalance: profile.points_balance,
  };
});

/** Signed in at all. Everything else builds on this. */
export async function requireMember(): Promise<SessionMember> {
  const member = await getSessionMember();
  if (!member) redirect("/login");
  return member;
}

/**
 * Signed in AND approved. This is the gate for every real member feature --
 * a pending applicant or a suspended member gets bounced to a holding page.
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
