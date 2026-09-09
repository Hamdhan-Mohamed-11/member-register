"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSecretary } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true; status?: string } | { ok: false; error: string };

const priceSchema = z.object({
  orderId: z.string().uuid(),
  message: z.string().trim().max(2000).optional(),
  prices: z
    .array(z.object({ item_id: z.string().uuid(), unit_price: z.number().min(0) }))
    .max(50),
});

/**
 * Confirms or corrects the price on an order.
 *
 * This is the only way an order gets a chargeable total. Whether the member
 * has to agree again is decided in SQL, not here: set_book_order_price returns
 * 'quoted' when any line went UP and 'agreed' when nothing did, because only an
 * increase needs consent. Deciding that in the UI would let the two disagree.
 */
export async function setOrderPrice(input: {
  orderId: string;
  prices: { item_id: string; unit_price: number }[];
  message?: string;
}): Promise<ActionResult> {
  await requireSecretary();

  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid prices." };
  }

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("set_book_order_price", {
    p_order_id: parsed.data.orderId,
    p_unit_prices: parsed.data.prices,
    p_message: parsed.data.message || undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/orders");
  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { ok: true, status: data as unknown as string };
}

export async function markOrderFulfilled(orderId: string): Promise<ActionResult> {
  await requireSecretary();
  if (!z.string().uuid().safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("set_book_order_fulfilled", {
    p_order_id: orderId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/orders");
  return { ok: true };
}
