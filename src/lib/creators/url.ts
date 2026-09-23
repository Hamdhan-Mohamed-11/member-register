import { getSupabaseUrl } from "@/lib/supabase/env";

/**
 * The public URL of a submitted book's cover.
 *
 * The bucket is public for the same reason the flyers one is: the cover shows
 * on the shop page, and a signed URL would expire while the page was still
 * open. Built by hand so a server component can call it with only the path.
 */
export function bookCoverUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${getSupabaseUrl()}/storage/v1/object/public/book-covers/${path}`;
}
