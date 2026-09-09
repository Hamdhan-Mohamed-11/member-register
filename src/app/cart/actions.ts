"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";
import { getBookSnapshots } from "@/lib/legacy/books";
import { priceLine } from "@/lib/pricing";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const addSchema = z.object({
  bookId: z.coerce.number().int().positive(),
  title: z.string().trim().max(300).optional(),
  author: z.string().trim().max(200).optional(),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
});

export async function addToCart(formData: FormData): Promise<ActionResult> {
  const member = await requireActiveMember();

  const parsed = addSchema.safeParse({
    bookId: formData.get("bookId"),
    title: formData.get("title") ?? "",
    author: formData.get("author") ?? "",
    quantity: formData.get("quantity") ?? 1,
  });
  if (!parsed.success) return { ok: false, error: "That book couldn't be added." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.from("cart_items").upsert(
    {
      member_id: member.userId,
      book_id: parsed.data.bookId,
      title: parsed.data.title ?? "",
      author: parsed.data.author ?? "",
      quantity: parsed.data.quantity,
    },
    { onConflict: "member_id,book_id" },
  );
  if (error) return { ok: false, error: error.message };

  // Adding to the basket takes it off the buy wishlist -- keeping a book on
  // both lists means two places to remove it from and two chances to forget.
  await supabase
    .from("book_wishlist")
    .delete()
    .eq("book_id", parsed.data.bookId)
    .eq("kind", "buy");

  revalidateCart();
  return { ok: true };
}

export async function setCartQuantity(
  bookId: number,
  quantity: number,
): Promise<ActionResult> {
  const member = await requireActiveMember();
  const supabase = await getActionSupabase();

  if (!Number.isInteger(bookId) || bookId <= 0) {
    return { ok: false, error: "Unknown book." };
  }

  if (quantity <= 0) {
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("book_id", bookId)
      .eq("member_id", member.userId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("cart_items")
      .update({ quantity: Math.min(20, quantity) })
      .eq("book_id", bookId)
      .eq("member_id", member.userId);
    if (error) return { ok: false, error: error.message };
  }

  revalidateCart();
  return { ok: true };
}

/**
 * Turns the basket into an order awaiting the club's review.
 *
 * The prices are looked up HERE, from the live catalogue, rather than taken
 * from the page -- a browser can post anything. That still is not a guarantee,
 * because a member can call the RPC through PostgREST directly, which is
 * exactly why the database treats these as `asking` prices and refuses to
 * build a payment from them. See migration 0025. Fetching them properly is
 * about the admin seeing a sensible number to check, not about trust.
 */
export async function placeOrder(note: string): Promise<ActionResult<{ orderId: string }>> {
  await requireActiveMember();
  const supabase = await getActionSupabase();

  const { data: cart } = await supabase
    .from("cart_items")
    .select("book_id, title, author, quantity");

  const lines = (cart ?? []) as unknown as {
    book_id: number;
    title: string;
    author: string;
    quantity: number;
  }[];

  if (lines.length === 0) return { ok: false, error: "Your basket is empty." };

  const { data: settings } = await supabase
    .from("app_settings")
    .select("book_discount_percent")
    .eq("id", 1)
    .maybeSingle();
  const discount = Number(settings?.book_discount_percent ?? 0);

  const snapshots = await getBookSnapshots(lines.map((l) => Number(l.book_id)));
  const byId = snapshots.ok ? snapshots.data : new Map();

  const items = lines.map((l) => {
    const snap = byId.get(Number(l.book_id));
    // A book whose price could not be fetched goes in at zero rather than
    // being dropped: the member asked for it, and an admin pricing a line at
    // zero is a visible thing to fix. Silently removing it from their order
    // is not -- and the catalogue host being briefly down is not a reason to
    // quietly change what someone ordered.
    const memberCents = snap ? priceLine(snap.priceLkr, discount).memberCents : 0;
    return {
      book_id: Number(l.book_id),
      // Prefer the live title over the snapshot taken when it went in the
      // basket: it is fresher, and the basket copy exists only for when the
      // catalogue cannot be reached.
      title: snap?.title || l.title,
      author: snap?.author || l.author,
      quantity: l.quantity,
      unit_price: memberCents / 100,
    };
  });

  const { data, error } = await supabase.rpc("place_book_order", {
    p_items: items,
    p_note: note?.trim() || undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidateCart();
  revalidatePath("/orders");
  return { ok: true, data: { orderId: data as unknown as string } };
}

export async function respondToQuote(
  orderId: string,
  accept: boolean,
): Promise<ActionResult> {
  await requireActiveMember();
  if (!z.string().uuid().safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("respond_to_quote", {
    p_order_id: orderId,
    p_accept: accept,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true };
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  await requireActiveMember();
  if (!z.string().uuid().safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("cancel_book_order", { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true };
}

export async function postOrderMessage(
  orderId: string,
  body: string,
): Promise<ActionResult> {
  await requireActiveMember();
  if (!z.string().uuid().safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }
  if (!body.trim()) return { ok: false, error: "Write something first." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("post_order_message", {
    p_order_id: orderId,
    p_body: body.trim(),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { ok: true };
}

function revalidateCart() {
  revalidatePath("/cart");
  revalidatePath("/books");
}
