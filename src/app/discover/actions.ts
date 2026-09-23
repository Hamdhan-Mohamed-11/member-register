"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember, requireStaff } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const idSchema = z.string().uuid();

/**
 * Likes a post, or takes the like back.
 *
 * A toggle rather than separate actions, for the same reason as the wishlist:
 * the button is one control whose meaning depends on the current state, and
 * two actions would let the page's idea of that drift from the database's.
 */
export async function toggleLike(postId: string): Promise<ActionResult<{ liked: boolean }>> {
  const member = await requireActiveMember();
  if (!idSchema.safeParse(postId).success) {
    return { ok: false, error: "Unknown post." };
  }

  const supabase = await getActionSupabase();
  const { data: existing } = await supabase
    .from("discover_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("member_id", member.userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("discover_likes")
      .delete()
      .eq("post_id", postId)
      .eq("member_id", member.userId);
    if (error) return { ok: false, error: error.message };
    revalidate();
    return { ok: true, data: { liked: false } };
  }

  const { error } = await supabase
    .from("discover_likes")
    .insert({ post_id: postId, member_id: member.userId });

  // A duplicate means a second tap landed while the first was in flight. The
  // end state is what they asked for, so this is not an error they can act on.
  if (error && !error.message.includes("duplicate key")) {
    return { ok: false, error: error.message };
  }

  revalidate();
  return { ok: true, data: { liked: true } };
}

export async function toggleSave(postId: string): Promise<ActionResult<{ saved: boolean }>> {
  const member = await requireActiveMember();
  if (!idSchema.safeParse(postId).success) {
    return { ok: false, error: "Unknown post." };
  }

  const supabase = await getActionSupabase();
  const { data: existing } = await supabase
    .from("discover_saves")
    .select("post_id")
    .eq("post_id", postId)
    .eq("member_id", member.userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("discover_saves")
      .delete()
      .eq("post_id", postId)
      .eq("member_id", member.userId);
    if (error) return { ok: false, error: error.message };
    revalidate();
    return { ok: true, data: { saved: false } };
  }

  const { error } = await supabase
    .from("discover_saves")
    .insert({ post_id: postId, member_id: member.userId });
  if (error && !error.message.includes("duplicate key")) {
    return { ok: false, error: error.message };
  }

  revalidate();
  return { ok: true, data: { saved: true } };
}

const postSchema = z.object({
  clubId: z.string().uuid(),
  kind: z.enum(["photo", "video"]),
  storagePath: z.string().min(3).max(400),
  caption: z.string().trim().max(500).optional(),
  posterPath: z.string().max(400).optional(),
  sessionId: z.string().uuid().optional(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  durationS: z.number().int().min(0).max(36000).optional(),
});

/**
 * Records a post whose media the browser has already uploaded.
 *
 * The upload went straight from the browser to storage, where a policy limits
 * writes to clubs the caller administers. create_discover_post re-checks both
 * the club AND that the key sits under that club's folder -- without which an
 * admin of one club could attach a file belonging to another.
 */
export async function createPost(input: {
  clubId: string;
  kind: "photo" | "video";
  storagePath: string;
  caption?: string;
  posterPath?: string;
  sessionId?: string;
  width?: number;
  height?: number;
  durationS?: number;
}): Promise<ActionResult<{ id: string }>> {
  await requireStaff();

  const parsed = postSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid post." };
  }

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("create_discover_post", {
    p_club_id: parsed.data.clubId,
    p_kind: parsed.data.kind,
    p_storage_path: parsed.data.storagePath,
    p_caption: parsed.data.caption || undefined,
    p_poster_path: parsed.data.posterPath || undefined,
    p_session_id: parsed.data.sessionId || undefined,
    p_width: parsed.data.width,
    p_height: parsed.data.height,
    p_duration_s: parsed.data.durationS,
  });
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true, data: { id: data as unknown as string } };
}

export async function deletePost(postId: string): Promise<ActionResult> {
  await requireStaff();
  if (!idSchema.safeParse(postId).success) {
    return { ok: false, error: "Unknown post." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("delete_discover_post", { p_id: postId });
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

/**
 * Sets or replaces a video's thumbnail, after the image has been uploaded
 * under the post's club folder. set_discover_poster re-checks both.
 */
export async function setPostPoster(postId: string, posterPath: string): Promise<ActionResult> {
  await requireStaff();
  if (!idSchema.safeParse(postId).success || posterPath.length < 3 || posterPath.length > 400) {
    return { ok: false, error: "Unknown post." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("set_discover_poster", {
    p_id: postId,
    p_poster_path: posterPath,
  });
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

const updateSchema = z.object({
  caption: z.string().trim().max(500),
  sessionId: z.string().uuid().nullable(),
  showOnHome: z.boolean(),
});

/**
 * Edits a post after the fact: its caption, the session it came from, and
 * whether it appears on the public homepage. update_discover_post re-checks
 * the caller runs the post's club and that the session is that club's.
 */
export async function updatePost(
  postId: string,
  input: { caption: string; sessionId: string | null; showOnHome: boolean },
): Promise<ActionResult> {
  await requireStaff();
  const parsed = updateSchema.safeParse(input);
  if (!idSchema.safeParse(postId).success || !parsed.success) {
    return { ok: false, error: parsed.error?.issues[0]?.message ?? "Unknown post." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("update_discover_post", {
    p_id: postId,
    p_caption: parsed.data.caption,
    p_session_id: parsed.data.sessionId as unknown as string,
    p_show_on_home: parsed.data.showOnHome,
  });
  if (error) return { ok: false, error: error.message };

  revalidate();
  revalidatePath("/");
  revalidatePath("/feed");
  return { ok: true };
}

function revalidate() {
  revalidatePath("/discover");
  revalidatePath("/discover/saved");
  revalidatePath("/admin/discover");
}
