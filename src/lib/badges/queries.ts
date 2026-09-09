import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type BadgeRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string;
  family: string | null;
  threshold: number | null;
  tier: number;
  sortOrder: number;
};

export type EarnedBadge = BadgeRow & { earnedAt: string };

/**
 * One family of badges, collapsed for display.
 *
 * A member with 60 books read has earned three of the four "books read"
 * badges, and showing all three says the same thing three times. So a family
 * shows the highest badge earned, and the next one along as the thing to aim
 * at — which is the whole reason `badges` carries `family` and `threshold`
 * rather than being a flat list.
 *
 * `standalone` families are the one-off badges (first video, founding member).
 * They have no ladder, so `next` is always null.
 */
export type BadgeFamily = {
  key: string;
  /** Human name for the ladder, e.g. "Books read". */
  label: string;
  earned: EarnedBadge[];
  /** Highest earned in this family, or null if none yet. */
  best: EarnedBadge | null;
  /** The next rung, or null when the ladder is finished (or has none). */
  next: BadgeRow | null;
  /** Where the member currently stands, in the family's own unit. */
  value: number;
  /** The unit, for "3 of 5 books". */
  unit: string;
};

const FAMILY_LABELS: Record<string, { label: string; unit: string }> = {
  books_read: { label: "Books read", unit: "books" },
  presented: { label: "Presentations", unit: "presentations" },
  attend_streak: { label: "Attendance streak", unit: "months in a row" },
  points: { label: "Points", unit: "points" },
  readrise: { label: "Read and Rise", unit: "books funded" },
};

function toBadge(r: RawBadge): BadgeRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    icon: r.icon,
    family: r.family,
    threshold: r.threshold,
    tier: r.tier,
    sortOrder: r.sort_order,
  };
}

type RawBadge = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string;
  family: string | null;
  threshold: number | null;
  tier: number;
  sort_order: number;
};

/**
 * Everything /me/badges needs: the whole catalogue, what the caller has
 * earned, and how far along each ladder they are.
 *
 * The progress numbers come from the `badge_progress()` RPC rather than being
 * recounted here, because one of them (the attendance streak) is a
 * gaps-and-islands query that has to match `recompute_member_badges` exactly.
 * Two implementations of it would eventually disagree, and the page would
 * promise a badge that never arrives.
 */
export async function getMyBadges(memberId: string): Promise<{
  families: BadgeFamily[];
  standalone: { badge: BadgeRow; earnedAt: string | null }[];
  earnedCount: number;
  totalCount: number;
}> {
  const supabase = await getServerComponentSupabase();

  const [{ data: catalogue }, { data: mine }, { data: progress }] = await Promise.all([
    supabase
      .from("badges")
      .select("id, code, name, description, icon, family, threshold, tier, sort_order")
      .order("sort_order"),
    // Filtered to the caller explicitly. RLS lets member_badges return rows
    // for everyone in their directory too, so an unfiltered read would count a
    // clubmate's badges as their own.
    supabase.from("member_badges").select("badge_id, earned_at").eq("member_id", memberId),
    supabase.rpc("badge_progress"),
  ]);

  const all = ((catalogue ?? []) as unknown as RawBadge[]).map(toBadge);

  const earnedAtByBadge = new Map<string, string>();
  for (const row of (mine ?? []) as unknown as { badge_id: string; earned_at: string }[]) {
    earnedAtByBadge.set(row.badge_id, row.earned_at);
  }

  const values = new Map<string, number>();
  for (const row of (progress ?? []) as unknown as { family: string; value: number }[]) {
    values.set(row.family, row.value);
  }

  const families: BadgeFamily[] = [];
  for (const [key, meta] of Object.entries(FAMILY_LABELS)) {
    const rungs = all
      .filter((b) => b.family === key)
      .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
    if (rungs.length === 0) continue;

    const earned: EarnedBadge[] = rungs
      .filter((b) => earnedAtByBadge.has(b.id))
      .map((b) => ({ ...b, earnedAt: earnedAtByBadge.get(b.id)! }));

    families.push({
      key,
      label: meta.label,
      unit: meta.unit,
      earned,
      best: earned.length ? earned[earned.length - 1] : null,
      next: rungs.find((b) => !earnedAtByBadge.has(b.id)) ?? null,
      value: values.get(key) ?? 0,
    });
  }

  const standalone = all
    .filter((b) => !b.family)
    .map((badge) => ({ badge, earnedAt: earnedAtByBadge.get(badge.id) ?? null }));

  return {
    families,
    standalone,
    earnedCount: earnedAtByBadge.size,
    totalCount: all.length,
  };
}

/**
 * The badges another member has earned, for their profile page.
 *
 * Earned only, never progress — how close someone else is to their next badge
 * is not part of what the directory shares. RLS on member_badges applies the
 * same rule as the directory, so a member outside the caller's visibility
 * simply returns nothing.
 */
export async function getBadgesFor(memberId: string): Promise<EarnedBadge[]> {
  const supabase = await getServerComponentSupabase();

  const { data } = await supabase
    .from("member_badges")
    .select(
      "earned_at, badges ( id, code, name, description, icon, family, threshold, tier, sort_order )",
    )
    .eq("member_id", memberId)
    .order("earned_at", { ascending: false });

  type Row = { earned_at: string; badges: RawBadge | null };

  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.badges);

  // Only the highest rung of each family, same reasoning as the family view:
  // "Getting Started, Well Read, Bibliophile" on a profile is one fact told
  // three times.
  const bestByFamily = new Map<string, EarnedBadge>();
  const out: EarnedBadge[] = [];
  for (const row of rows) {
    const badge = { ...toBadge(row.badges!), earnedAt: row.earned_at };
    if (!badge.family) {
      out.push(badge);
      continue;
    }
    const held = bestByFamily.get(badge.family);
    if (!held || (badge.threshold ?? 0) > (held.threshold ?? 0)) {
      bestByFamily.set(badge.family, badge);
    }
  }

  return [...bestByFamily.values(), ...out].sort((a, b) => a.sortOrder - b.sortOrder);
}
