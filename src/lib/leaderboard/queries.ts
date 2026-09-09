import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

/**
 * The three windows, in the order the tabs show them.
 *
 * Monthly is first and is the default, because it is the target members are
 * actually chasing — an all-time board that opens on a member who joined in
 * 2019 tells a new member the game is already lost.
 */
export const LEADERBOARD_PERIODS = ["month", "year", "all"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  month: "This month",
  year: "This year",
  all: "All time",
};

export function parsePeriod(value: string | undefined): LeaderboardPeriod {
  return (LEADERBOARD_PERIODS as readonly string[]).includes(value ?? "")
    ? (value as LeaderboardPeriod)
    : "month";
}

export type LeaderboardRow = {
  place: number;
  memberId: string;
  firstName: string;
  lastName: string;
  avatarPath: string | null;
  clubName: string | null;
  points: number;
  isMe: boolean;
};

/**
 * The board for one period.
 *
 * Who appears is decided entirely by `shares_active_club` inside the RPC —
 * the same function the directory goes through. That is why there is no
 * "public board" and "company board" here as separate things: a company member
 * gets a board of their own company because that is who they can see, and a
 * public-club member gets everyone under Public Clubs for the same reason.
 * Adding a club type changes both surfaces at once, in SQL, with no deploy.
 */
export async function getLeaderboard(
  period: LeaderboardPeriod,
): Promise<LeaderboardRow[]> {
  const supabase = await getServerComponentSupabase();

  const { data } = await supabase.rpc("leaderboard", { p_period: period });

  type Raw = {
    place: number;
    member_id: string;
    first_name: string;
    last_name: string;
    avatar_path: string | null;
    club_name: string | null;
    points: number;
    is_me: boolean;
  };

  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    place: Number(r.place),
    memberId: r.member_id,
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    avatarPath: r.avatar_path,
    clubName: r.club_name,
    points: Number(r.points),
    isMe: r.is_me,
  }));
}
