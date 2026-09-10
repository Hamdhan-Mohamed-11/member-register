import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import type { ClubOption, MemberOption } from "@/app/admin/sessions/SessionForm";

/**
 * The clubs and members a session form may offer.
 *
 * `scope` is null for a super admin (every club) or a list of club ids for a
 * secretary -- see adminClubScope(). Filtering here is presentation: a
 * secretary who hand-posts another club's id is refused by upsert_session,
 * which is the actual control. Offering it in a dropdown would just be a
 * cruel way to find that out.
 */
export async function getSessionFormOptions(scope?: string[] | null): Promise<{
  clubs: ClubOption[];
  members: MemberOption[];
}> {
  const supabase = await getServerComponentSupabase();

  let clubQuery = supabase.from("clubs").select("id, name").eq("is_active", true).order("name");
  if (scope != null) {
    // An empty scope means a secretary with no club yet: offer nothing rather
    // than everything, which is what `.in()` with an empty list does.
    clubQuery = clubQuery.in("id", scope);
  }

  const [{ data: clubs }, { data: members }] = await Promise.all([
    clubQuery,
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .eq("status", "active")
      .order("first_name"),
  ]);

  return {
    clubs: (clubs ?? []) as ClubOption[],
    members: (members ?? []).map((m) => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`.trim() || m.email,
    })),
  };
}

/**
 * timestamptz -> the `YYYY-MM-DDTHH:mm` shape datetime-local requires.
 *
 * toISOString() would be wrong here: it converts to UTC, so an 18:00 session
 * shows as 12:30 in a +05:30 zone. Build the string from local parts instead.
 */
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
