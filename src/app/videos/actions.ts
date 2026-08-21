"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember, requireSecretary } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";
import { parseVideoUrl } from "@/lib/sessions/video";

export type ActionResult = { ok: true } | { ok: false; error: string };

const submitSchema = z.object({
  url: z.string().trim().min(1, "Please paste a video link").max(500),
  title: z.string().trim().min(2, "Please give the video a title").max(200),
  description: z.string().trim().max(1000).optional(),
  sessionId: z.string().uuid().optional(),
});

/**
 * Submits a video for moderation.
 *
 * The URL is parsed HERE, on the server, and only the provider and the opaque
 * id reach the database. A member could otherwise store `javascript:...` in
 * source_url and rely on some future page rendering it directly.
 *
 * The RPC decides the status, not this action -- a member's submission always
 * starts pending regardless of what is sent.
 */
export async function submitVideo(formData: FormData): Promise<ActionResult> {
  await requireActiveMember();

  const parsed = submitSchema.safeParse({
    url: formData.get("url") ?? "",
    title: formData.get("title") ?? "",
    description: formData.get("description") || undefined,
    sessionId: formData.get("sessionId") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid video." };
  }

  const embed = parseVideoUrl(parsed.data.url);
  if (!embed) {
    return {
      ok: false,
      error:
        "That doesn't look like a YouTube or Vimeo link. Paste the address from the browser's address bar.",
    };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("submit_video", {
    p_provider: embed.provider,
    p_external_id: embed.externalId,
    p_source_url: parsed.data.url,
    p_title: parsed.data.title,
    ...(parsed.data.description ? { p_description: parsed.data.description } : {}),
    ...(parsed.data.sessionId ? { p_session_id: parsed.data.sessionId } : {}),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/videos");
  revalidatePath("/me/videos");
  revalidatePath("/admin/videos");
  return { ok: true };
}

const moderateSchema = z.object({
  videoId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(300).optional(),
});

export async function moderateVideo(formData: FormData): Promise<ActionResult> {
  await requireSecretary();

  const parsed = moderateSchema.safeParse({
    videoId: formData.get("videoId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid moderation request." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("moderate_video", {
    p_video_id: parsed.data.videoId,
    p_status: parsed.data.status,
    ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  revalidatePath("/me/videos");
  return { ok: true };
}

export async function deleteVideo(formData: FormData): Promise<ActionResult> {
  await requireActiveMember();

  const videoId = z.string().uuid().safeParse(formData.get("videoId"));
  if (!videoId.success) return { ok: false, error: "Invalid video." };

  const supabase = await getActionSupabase();
  // The RPC decides who may delete what: a member can withdraw their own
  // submission while it is still pending, admins can remove anything.
  const { error } = await supabase.rpc("delete_video", { p_video_id: videoId.data });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/videos");
  revalidatePath("/me/videos");
  revalidatePath("/admin/videos");
  return { ok: true };
}
