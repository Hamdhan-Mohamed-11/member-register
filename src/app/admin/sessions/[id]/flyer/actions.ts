"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const saveSchema = z.object({
  sessionId: z.string().uuid(),
  path: z.string().min(3).max(300),
  template: z.string().trim().max(60),
});

/**
 * Points a session at a flyer the browser has just uploaded.
 *
 * The upload itself went straight from the browser to storage, where a policy
 * restricts writes to sessions the caller may administer. This records the
 * key, and set_session_flyer re-checks both the club AND that the key sits
 * under this session's folder -- a client posting another session's path would
 * otherwise repoint that session's flyer.
 */
export async function saveFlyer(
  sessionId: string,
  path: string,
  template: string,
): Promise<ActionResult> {
  await requireStaff();

  const parsed = saveSchema.safeParse({ sessionId, path, template });
  if (!parsed.success) return { ok: false, error: "Invalid flyer." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("set_session_flyer", {
    p_session_id: parsed.data.sessionId,
    p_path: parsed.data.path,
    p_template: parsed.data.template,
  });
  if (error) return { ok: false, error: error.message };

  revalidateSession(parsed.data.sessionId);
  return { ok: true };
}

export async function clearFlyer(sessionId: string): Promise<ActionResult> {
  await requireStaff();
  if (!z.string().uuid().safeParse(sessionId).success) {
    return { ok: false, error: "Unknown session." };
  }

  const supabase = await getActionSupabase();
  // Only the pointer is cleared. The object is left in the bucket rather than
  // deleted: a flyer that has already been posted to WhatsApp should not turn
  // into a broken image because someone tidied up in the admin area.
  const { error } = await supabase.rpc("set_session_flyer", {
    p_session_id: sessionId,
    p_path: undefined,
    p_template: undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidateSession(sessionId);
  return { ok: true };
}

function revalidateSession(id: string) {
  revalidatePath(`/admin/sessions/${id}`);
  revalidatePath(`/admin/sessions/${id}/flyer`);
  revalidatePath(`/sessions/${id}`);
  revalidatePath("/sessions");
}

/**
 * The flyer's book cover and sponsor, once their files are uploaded.
 *
 * Kept on the session rather than on one flyer, so the next flyer for the
 * same evening does not ask for them again. The RPC re-checks the club and
 * that each key sits under this session's folder.
 */
export async function saveFlyerAssets(input: {
  sessionId: string;
  /** null leaves the stored value alone; "" clears it. */
  bookImagePath: string | null;
  sponsorPath: string | null;
  sponsorName: string | null;
}): Promise<ActionResult> {
  await requireStaff();
  if (!z.string().uuid().safeParse(input.sessionId).success) {
    return { ok: false, error: "Unknown session." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("set_session_flyer_assets", {
    p_session_id: input.sessionId,
    p_book_image_path: input.bookImagePath ?? undefined,
    p_sponsor_path: input.sponsorPath ?? undefined,
    p_sponsor_name: input.sponsorName ?? undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/sessions/${input.sessionId}/flyer`);
  return { ok: true };
}
