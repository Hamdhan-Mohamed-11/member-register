"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const schema = z.object({
  id: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(1, "Please give the book a title.").max(300),
  author: z.string().trim().max(200).optional(),
  isbn: z.string().trim().max(40).optional(),
  category: z.string().trim().max(120).optional(),
  description: z.string().trim().max(4000).optional(),
  coverPath: z.string().trim().max(300).optional(),
  copies: z.coerce.number().int().min(0).max(999),
  shelfMark: z.string().trim().max(60).optional(),
  isActive: z.boolean(),
});

/**
 * Adds a book to the lending shelf, or edits one already there.
 *
 * Super admin only, re-checked inside save_library_book: the shelf is the
 * club's own property and the collection desk is theirs.
 */
export async function saveLibraryBook(input: {
  id?: number;
  title: string;
  author?: string;
  isbn?: string;
  category?: string;
  description?: string;
  coverPath?: string;
  copies: number;
  shelfMark?: string;
  isActive: boolean;
}): Promise<ActionResult<{ id: number }>> {
  await requireSuperAdmin();

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("save_library_book", {
    p_id: parsed.data.id,
    p_title: parsed.data.title,
    p_author: parsed.data.author ?? "",
    p_isbn: parsed.data.isbn,
    p_category: parsed.data.category,
    p_description: parsed.data.description,
    // Undefined leaves the cover alone; an empty string clears it. Editing a
    // title must not silently lose the picture.
    p_cover_path: parsed.data.coverPath,
    p_copies: parsed.data.copies,
    p_shelf_mark: parsed.data.shelfMark,
    p_is_active: parsed.data.isActive,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/library/shelf");
  revalidatePath("/library");
  return { ok: true, data: { id: Number(data) } };
}

/**
 * Takes a book off the shelf.
 *
 * The RPC deletes it only if nobody ever borrowed it; otherwise it is retired,
 * so old borrow requests still have a book behind them.
 */
export async function removeLibraryBook(id: number): Promise<ActionResult<{ what: string }>> {
  await requireSuperAdmin();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Unknown book." };

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("remove_library_book", { p_id: id });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/library/shelf");
  revalidatePath("/library");
  return { ok: true, data: { what: String(data) } };
}

const bulkRowSchema = z.object({
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().max(200),
  isbn: z.string().trim().max(40),
  category: z.string().trim().max(120),
  description: z.string().trim().max(4000),
  shelf_mark: z.string().trim().max(60),
  copies: z.coerce.number().int().min(0).max(999),
});

/**
 * A shelf from a spreadsheet.
 *
 * Matched on title and author inside the RPC, so a club that fixes a typo and
 * re-imports the same sheet updates the shelf instead of doubling it.
 */
export async function bulkAddLibraryBooks(
  rows: unknown[],
): Promise<ActionResult<{ added: number; updated: number }>> {
  await requireSuperAdmin();

  const parsed = z.array(bulkRowSchema).max(500).safeParse(rows);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That file could not be read." };
  }
  if (parsed.data.length === 0) return { ok: false, error: "No books in that file." };

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("bulk_add_library_books", {
    p_books: parsed.data,
  });
  if (error) return { ok: false, error: error.message };

  const result = (data ?? [])[0] as { added: number; updated: number } | undefined;

  revalidatePath("/admin/library/shelf");
  revalidatePath("/library");
  return {
    ok: true,
    data: { added: Number(result?.added ?? 0), updated: Number(result?.updated ?? 0) },
  };
}
