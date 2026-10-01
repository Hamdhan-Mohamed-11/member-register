"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";
import { getSupabaseUrl } from "@/lib/supabase/env";

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  id: z.coerce.number().int().positive(),
  coverPath: z.string().trim().max(300).optional(),
  title: z.string().trim().max(300).optional(),
  author: z.string().trim().max(200).optional(),
  description: z.string().trim().max(4000).optional(),
});

/**
 * The club's own words and cover for a book from the store.
 *
 * Written to override columns the sync never touches, so a cover supplied for
 * a book nobody has a picture of survives every refresh of the catalogue.
 * Undefined leaves a field alone; an empty string clears the override and the
 * store's own value shows again.
 */
export async function saveShopBookOverrides(input: {
  id: number;
  coverPath?: string;
  title?: string;
  author?: string;
  description?: string;
}): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  // A storage path becomes the public URL here rather than in the browser, so
  // the column holds something any page can render without knowing the bucket.
  const cover =
    parsed.data.coverPath === undefined
      ? undefined
      : parsed.data.coverPath === ""
        ? ""
        : `${getSupabaseUrl()}/storage/v1/object/public/shop-covers/${parsed.data.coverPath}`;

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("set_store_book_overrides", {
    p_id: parsed.data.id,
    p_cover: cover,
    p_title: parsed.data.title,
    p_author: parsed.data.author,
    p_description: parsed.data.description,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/shop/books");
  revalidatePath("/books");
  revalidatePath(`/books/${parsed.data.id}`);
  return { ok: true };
}
