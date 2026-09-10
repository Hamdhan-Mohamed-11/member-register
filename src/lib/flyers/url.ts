import { getSupabaseUrl } from "@/lib/supabase/env";

/**
 * The public URL of a saved flyer.
 *
 * The `flyers` bucket is public, unlike `avatars`, so this is a plain URL
 * rather than a route that signs one. That is the point: a flyer has to open
 * for someone who was sent it on WhatsApp and has no account here.
 *
 * Built by hand rather than through supabase.storage.getPublicUrl() so it can
 * be called from a server component without a client, and from anywhere that
 * only has the path.
 */
export function flyerUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${getSupabaseUrl()}/storage/v1/object/public/flyers/${path}`;
}
