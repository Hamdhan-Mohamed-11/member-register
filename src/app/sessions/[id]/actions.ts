"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().uuid();

/**
 * Reserves a place. The fee is computed by book_session() in the database --
 * this action never sends one, and would be ignored if it did.
 */
export async function bookSession(formData: FormData): Promise<ActionResult> {
  await requireActiveMember();

  const sessionId = idSchema.safeParse(formData.get("sessionId"));
  if (!sessionId.success) return { ok: false, error: "Invalid session." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("book_session", {
    p_session_id: sessionId.data,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/sessions/${sessionId.data}`);
  revalidatePath("/sessions");
  return { ok: true };
}

export async function cancelBooking(formData: FormData): Promise<ActionResult> {
  await requireActiveMember();

  const bookingId = idSchema.safeParse(formData.get("bookingId"));
  const sessionId = idSchema.safeParse(formData.get("sessionId"));
  if (!bookingId.success) return { ok: false, error: "Invalid booking." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("cancel_session_booking", {
    p_booking_id: bookingId.data,
  });

  if (error) return { ok: false, error: error.message };

  if (sessionId.success) revalidatePath(`/sessions/${sessionId.data}`);
  revalidatePath("/sessions");
  return { ok: true };
}

/**
 * Feedback on the evening, or on the person who presented.
 *
 * The database decides who may: only someone the club recorded as attending,
 * only after the session, and never about their own presenting. Saving again
 * replaces the earlier answer.
 */
export async function giveFeedback(
  sessionId: string,
  kind: "session" | "presenter",
  rating: number,
  comment: string,
): Promise<ActionResult> {
  await requireActiveMember();

  if (!idSchema.safeParse(sessionId).success) return { ok: false, error: "Invalid session." };
  if (!["session", "presenter"].includes(kind)) return { ok: false, error: "Invalid form." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Choose a rating from 1 to 5." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("give_session_feedback", {
    p_session_id: sessionId,
    p_kind: kind,
    p_rating: rating,
    p_comment: comment.trim() || undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}
