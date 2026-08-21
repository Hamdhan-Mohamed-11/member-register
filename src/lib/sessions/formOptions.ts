import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import type { ClubOption, MemberOption } from "@/app/admin/sessions/SessionForm";

export async function getSessionFormOptions(): Promise<{
  clubs: ClubOption[];
  members: MemberOption[];
}> {
  const supabase = await getServerComponentSupabase();

  const [{ data: clubs }, { data: members }] = await Promise.all([
    supabase.from("clubs").select("id, name").eq("is_active", true).order("name"),
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
