"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Please enter your first name").max(80),
  lastName: z.string().trim().max(80),
  phone: z.string().trim().max(40),
  bio: z.string().trim().max(1000),
  learningTags: z.string().max(500),
});

/**
 * Updates the caller's own profile.
 *
 * Only the six self-editable columns are touched, and that is enforced by a
 * COLUMN GRANT in the database, not by this list -- Postgres rejects the
 * UPDATE outright if the payload mentions role, status, points_balance or
 * email. This action is convenience; the grant is the control.
 */
export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const member = await requireActiveMember();

  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    phone: formData.get("phone") ?? "",
    bio: formData.get("bio") ?? "",
    learningTags: formData.get("learningTags") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }

  const tags = parsed.data.learningTags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);

  const supabase = await getActionSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone || null,
      bio: parsed.data.bio || null,
      learning_tags: tags,
    })
    .eq("id", member.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me");
  revalidatePath("/me/edit");
  revalidatePath("/directory");
  return { ok: true };
}

const avatarSchema = z.object({ path: z.string().min(1).max(300) });

/**
 * Records the storage key of a freshly uploaded avatar.
 *
 * The upload itself happens from the browser straight to Supabase Storage --
 * the file never passes through this server. Storage RLS restricts writes to
 * `<own uuid>/...`, so a member cannot upload into someone else's folder, and
 * the path is re-derived here rather than trusted: a client claiming another
 * member's path would otherwise repoint their photo.
 */
export async function setAvatarPath(formData: FormData): Promise<ActionResult> {
  const member = await requireActiveMember();

  const parsed = avatarSchema.safeParse({ path: formData.get("path") });
  if (!parsed.success) return { ok: false, error: "Invalid upload." };

  if (!parsed.data.path.startsWith(`${member.userId}/`)) {
    return { ok: false, error: "Invalid upload." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: parsed.data.path })
    .eq("id", member.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me");
  revalidatePath("/me/edit");
  revalidatePath("/directory");
  return { ok: true };
}
