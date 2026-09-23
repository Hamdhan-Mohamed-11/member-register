"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCreator, requireMember } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const registerSchema = z.object({
  kind: z.enum(["author", "publisher"]),
  name: z.string().trim().min(1, "Please give a name.").max(200),
  about: z.string().trim().max(2000).optional(),
  website: z.string().trim().max(300).optional(),
});

/**
 * Turns the signed-in account into an author or a publisher.
 *
 * Deliberately requireMember and not requireCreator: this is the step that
 * makes someone a creator, so demanding they already be one would close the
 * only door in.
 */
export async function registerCreator(formData: FormData): Promise<ActionResult> {
  await requireMember();

  const parsed = registerSchema.safeParse({
    kind: formData.get("kind"),
    name: formData.get("name"),
    about: formData.get("about") || undefined,
    website: formData.get("website") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("register_creator", {
    p_kind: parsed.data.kind,
    p_name: parsed.data.name,
    p_about: parsed.data.about,
    p_website: parsed.data.website,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/creator");
  return { ok: true };
}

const authorSchema = z.object({
  name: z.string().trim().min(1, "Please give the author a name.").max(200),
  bio: z.string().trim().max(2000).optional(),
});

/** A publisher adds a name to its list. */
export async function addAuthor(formData: FormData): Promise<ActionResult> {
  await requireCreator();

  const parsed = authorSchema.safeParse({
    name: formData.get("name"),
    bio: formData.get("bio") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("publisher_add_author", {
    p_name: parsed.data.name,
    p_bio: parsed.data.bio,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/creator/authors");
  return { ok: true };
}

const bookSchema = z.object({
  authorId: z.string().uuid("Please choose the author."),
  title: z.string().trim().min(1, "Please give the book a title.").max(300),
  priceLkr: z.coerce.number().min(0, "Please give a price.").max(1_000_000),
  blurb: z.string().trim().max(4000).optional(),
  isbn: z.string().trim().max(40).optional(),
  coverPath: z.string().trim().max(300).optional(),
});

/** Submits a book for the shop. It goes to a super admin, never straight on sale. */
export async function submitBook(formData: FormData): Promise<ActionResult> {
  await requireCreator();

  const parsed = bookSchema.safeParse({
    authorId: formData.get("authorId"),
    title: formData.get("title"),
    priceLkr: formData.get("priceLkr"),
    blurb: formData.get("blurb") || undefined,
    isbn: formData.get("isbn") || undefined,
    coverPath: formData.get("coverPath") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("submit_author_book", {
    p_author_id: parsed.data.authorId,
    p_title: parsed.data.title,
    p_price_lkr: parsed.data.priceLkr,
    p_blurb: parsed.data.blurb,
    p_isbn: parsed.data.isbn,
    p_cover_path: parsed.data.coverPath,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/creator");
  return { ok: true };
}

/** Takes a book back off the shop. */
export async function withdrawBook(bookId: number): Promise<ActionResult> {
  await requireCreator();

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("withdraw_author_book", { p_book_id: bookId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/creator");
  revalidatePath("/books");
  return { ok: true };
}
