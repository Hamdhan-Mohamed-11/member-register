"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  clubName: z.string().trim().min(1, "Please give the club a name.").max(120),
  description: z.string().trim().max(2000).optional(),
  city: z.string().trim().max(120).optional(),
  meets: z.string().trim().max(200).optional(),
  memberCount: z.coerce.number().int().min(0).max(100_000).optional(),
  message: z.string().trim().max(2000).optional(),
});

/**
 * Applies to bring an existing club onto the portal.
 *
 * requireMember, not requireActiveMember: the applicant has an account and
 * nothing else -- they are not joining a club, so nobody has admitted them to
 * one, and the usual "approved member" gate would shut the door on exactly
 * the person this is for.
 */
export async function requestNewClub(formData: FormData): Promise<ActionResult> {
  await requireMember();

  const parsed = schema.safeParse({
    clubName: formData.get("clubName"),
    description: formData.get("description") || undefined,
    city: formData.get("city") || undefined,
    meets: formData.get("meets") || undefined,
    memberCount: formData.get("memberCount") || undefined,
    message: formData.get("message") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("request_new_club", {
    p_club_name: parsed.data.clubName,
    p_description: parsed.data.description,
    p_city: parsed.data.city,
    p_meets: parsed.data.meets,
    p_member_count: parsed.data.memberCount,
    p_message: parsed.data.message,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/clubs/new");
  revalidatePath("/pending");
  return { ok: true };
}
