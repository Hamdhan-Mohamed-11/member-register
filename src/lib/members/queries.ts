import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import type { ClubKind } from "@/lib/auth/session";

/**
 * Avatars live in a private bucket, so the URL is always this route -- which
 * checks visibility before redirecting to a signed URL. Never build a public
 * storage URL from avatar_path.
 */
export function avatarUrl(
  profileId: string,
  avatarPath: string | null | undefined,
): string | null {
  return avatarPath ? `/api/avatars/${profileId}` : null;
}

export type ReadingItem = {
  id: string;
  title: string;
  author: string;
  status: "want_to_read" | "reading" | "read";
  dateRead: string | null;
  notes: string | null;
  /** Open Library cover id, found when the book was added. */
  coverId: number | null;
};

export type MemberProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  bio: string | null;
  learningTags: string[];
  avatarPath: string | null;
  pointsBalance: number;
  joinedOn: string;
  clubs: { id: string; name: string; kind: ClubKind }[];
  reading: ReadingItem[];
};

type RawMembership = {
  status: string;
  clubs: { id: string; name: string; kind: string } | null;
};

/**
 * Loads a member's public-facing profile.
 *
 * Returns null when the caller may not see them -- RLS does that, not a check
 * here: the profiles row simply does not come back. Callers should treat null
 * as notFound() rather than as "no such person", because the two are
 * deliberately indistinguishable from outside.
 */
export async function getMemberProfile(
  profileId: string,
): Promise<MemberProfile | null> {
  const supabase = await getServerComponentSupabase();

  const { data } = await supabase
    .from("profiles")
    .select(
      `id, first_name, last_name, email, phone, bio, learning_tags, avatar_path,
       points_balance, joined_on,
       club_memberships ( status, clubs ( id, name, kind ) )`,
    )
    .eq("id", profileId)
    .maybeSingle();

  if (!data) return null;

  // A separate query rather than a nested embed: reading_items has its own
  // policy, and keeping it separate means an unreadable reading list yields an
  // empty list instead of dropping the whole profile.
  const { data: reading } = await supabase
    .from("reading_items")
    .select("id, title, author, status, date_read, notes, cover_id")
    .eq("member_id", profileId)
    .order("date_read", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const clubs = ((data.club_memberships ?? []) as unknown as RawMembership[])
    .filter((m) => m.status === "active" && m.clubs)
    .map((m) => ({
      id: m.clubs!.id,
      name: m.clubs!.name,
      kind: m.clubs!.kind as ClubKind,
    }));

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    // NOTE: phone is returned to anyone who can see this profile, because the
    // profiles policy is row-level and hands back every column. ProfileView
    // never renders it, but a member could read it straight from PostgREST.
    // If it should be admin-only, it needs to move to its own table -- column
    // grants cannot express "only for some rows".
    phone: data.phone,
    bio: data.bio,
    learningTags: data.learning_tags ?? [],
    avatarPath: data.avatar_path,
    pointsBalance: data.points_balance,
    joinedOn: data.joined_on,
    clubs,
    reading: (reading ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      status: r.status as ReadingItem["status"],
      dateRead: r.date_read,
      notes: r.notes,
      coverId: r.cover_id,
    })),
  };
}

export type DirectoryEntry = {
  id: string;
  firstName: string;
  lastName: string;
  avatarPath: string | null;
  pointsBalance: number;
  bio: string | null;
  clubs: string[];
  currentlyReading: string[];
  /** The first book they are reading, with enough to draw its cover. */
  nowReading: { title: string; author: string; coverId: number | null } | null;
};

/**
 * The member directory.
 *
 * There is no visibility filter in this query, and that is the point: RLS
 * returns exactly the members the caller shares an active club with. If this
 * ever starts showing strangers, the bug is in the policy, not here.
 */
export async function getDirectory(): Promise<DirectoryEntry[]> {
  const supabase = await getServerComponentSupabase();

  const { data } = await supabase
    .from("profiles")
    .select(
      `id, first_name, last_name, avatar_path, points_balance, bio,
       club_memberships ( status, clubs ( name ) ),
       reading_items ( title, author, status, cover_id, created_at )`,
    )
    .eq("status", "active")
    .order("first_name");

  type Raw = {
    id: string;
    first_name: string;
    last_name: string;
    avatar_path: string | null;
    points_balance: number;
    bio: string | null;
    club_memberships: { status: string; clubs: { name: string } | null }[] | null;
    reading_items:
      | {
          title: string;
          author: string;
          status: string;
          cover_id: number | null;
          created_at: string;
        }[]
      | null;
  };

  return ((data ?? []) as unknown as Raw[]).map((p) => {
    // Newest first, so the card shows what they picked up most recently.
    const reading = (p.reading_items ?? [])
      .filter((r) => r.status === "reading")
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const first = reading[0];
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      avatarPath: p.avatar_path,
      pointsBalance: p.points_balance,
      bio: p.bio,
      clubs: (p.club_memberships ?? [])
        .filter((m) => m.status === "active" && m.clubs)
        .map((m) => m.clubs!.name),
      currentlyReading: reading.map((r) => r.title),
      nowReading: first
        ? { title: first.title, author: first.author, coverId: first.cover_id }
        : null,
    };
  });
}
