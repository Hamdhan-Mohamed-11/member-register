"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const wishSchema = z.object({
  bookId: z.coerce.number().int().positive(),
  kind: z.enum(["borrow", "buy"]),
  title: z.string().trim().max(300).optional(),
  author: z.string().trim().max(200).optional(),
});

/**
 * Adds a book to one of the two wishlists, or removes it if already there.
 *
 * One toggle rather than separate add and remove actions, because the button
 * is a single control whose meaning depends on what is already saved — and
 * two actions would let the page's idea of that drift from the database's.
 *
 * Note there is no library-access check on the BORROW wishlist. Wanting to
 * borrow something later is not borrowing it; gating the wish as well as the
 * act would hide the reason to buy the add-on from the people most likely to.
 */
export async function toggleWishlist(formData: FormData): Promise<ActionResult<{ added: boolean }>> {
  const member = await requireActiveMember();

  const parsed = wishSchema.safeParse({
    bookId: formData.get("bookId"),
    kind: formData.get("kind"),
    title: formData.get("title") ?? "",
    author: formData.get("author") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "That book couldn't be saved." };

  const supabase = await getActionSupabase();
  const { bookId, kind } = parsed.data;

  const { data: existing } = await supabase
    .from("book_wishlist")
    .select("id")
    .eq("book_id", bookId)
    .eq("kind", kind)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("book_wishlist").delete().eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidateLists();
    return { ok: true, data: { added: false } };
  }

  const { error } = await supabase.from("book_wishlist").insert({
    member_id: member.userId,
    book_id: bookId,
    kind,
    title: parsed.data.title ?? "",
    author: parsed.data.author ?? "",
  });

  // A unique violation means a second tap landed while the first was in
  // flight. The end state is what the member asked for, so report success
  // rather than an error they cannot act on.
  if (error && !error.message.includes("duplicate key")) {
    return { ok: false, error: error.message };
  }

  revalidateLists();
  return { ok: true, data: { added: true } };
}

const borrowSchema = z.object({
  bookId: z.coerce.number().int().positive(),
  title: z.string().trim().max(300).optional(),
  author: z.string().trim().max(200).optional(),
});

export async function requestBorrow(formData: FormData): Promise<ActionResult> {
  await requireActiveMember();

  const parsed = borrowSchema.safeParse({
    bookId: formData.get("bookId"),
    title: formData.get("title") ?? "",
    author: formData.get("author") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "That book couldn't be requested." };

  const supabase = await getActionSupabase();
  // The add-on check lives inside the RPC, not here. This action only carries
  // the request; request_borrow is what decides whether it is allowed.
  const { error } = await supabase.rpc("request_borrow", {
    p_book_id: parsed.data.bookId,
    p_title: parsed.data.title ?? "",
    p_author: parsed.data.author ?? "",
  });
  if (error) return { ok: false, error: error.message };

  revalidateLists();
  return { ok: true };
}

export async function cancelBorrowRequest(id: string): Promise<ActionResult> {
  await requireActiveMember();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Unknown request." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("cancel_borrow_request", { p_id: id });
  if (error) return { ok: false, error: error.message };

  revalidateLists();
  return { ok: true };
}

function revalidateLists() {
  revalidatePath("/library");
  revalidatePath("/me/wishlist");
  revalidatePath("/me/borrowing");
}
