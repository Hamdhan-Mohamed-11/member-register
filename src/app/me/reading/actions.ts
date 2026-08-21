"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const STATUSES = ["want_to_read", "reading", "read"] as const;

const addSchema = z.object({
  title: z.string().trim().min(1, "Please give the book a title").max(300),
  author: z.string().trim().max(200).optional(),
  status: z.enum(STATUSES),
});

export async function addReadingItem(formData: FormData): Promise<ActionResult> {
  const member = await requireActiveMember();

  const parsed = addSchema.safeParse({
    title: formData.get("title"),
    author: formData.get("author") ?? "",
    status: formData.get("status") ?? "reading",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid book." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.from("reading_items").insert({
    member_id: member.userId,
    title: parsed.data.title,
    author: parsed.data.author ?? "",
    status: parsed.data.status,
    // The schema requires date_read to be set exactly when status is 'read',
    // so adding a book straight to the history has to date it now.
    date_read: parsed.data.status === "read" ? new Date().toISOString().slice(0, 10) : null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me/reading");
  revalidatePath("/me");
  return { ok: true };
}

const statusSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(STATUSES),
});

/**
 * The member marks their own book read -- there is no admin step, and no
 * inference from anything else. This is the only thing that moves a book into
 * their reading history.
 */
export async function setReadingStatus(formData: FormData): Promise<ActionResult> {
  await requireActiveMember();

  const parsed = statusSchema.safeParse({
    itemId: formData.get("itemId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await getActionSupabase();

  // No .eq("member_id", ...) needed -- the update policy already restricts this
  // to the caller's own rows, and adding it here would imply the policy is
  // optional. It is not: this action is reachable by any signed-in member.
  const { error } = await supabase
    .from("reading_items")
    .update({
      status: parsed.data.status,
      date_read:
        parsed.data.status === "read" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", parsed.data.itemId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me/reading");
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteReadingItem(formData: FormData): Promise<ActionResult> {
  await requireActiveMember();

  const itemId = z.string().uuid().safeParse(formData.get("itemId"));
  if (!itemId.success) return { ok: false, error: "Invalid request." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.from("reading_items").delete().eq("id", itemId.data);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me/reading");
  revalidatePath("/me");
  return { ok: true };
}
