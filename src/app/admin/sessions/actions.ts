"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSecretary } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const sessionSchema = z.object({
  sessionId: z.string().uuid().nullable(),
  hostClubId: z.string().uuid(),
  title: z.string().trim().min(2, "Please give the session a title").max(200),
  bookTitle: z.string().trim().max(300),
  bookAuthor: z.string().trim().max(200),
  heldAt: z.string().min(1, "Please pick a date and time"),
  location: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
  presenter: z.string().uuid().nullable(),
  pricingKind: z.enum(["free", "paid"]),
  guestFee: z.coerce.number().min(0).nullable(),
  capacity: z.coerce.number().int().min(1).nullable(),
  status: z.enum(["scheduled", "completed", "cancelled"]),
  videoUrl: z.string().trim().max(500),
});

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s === "" ? null : s;
}

export async function saveSession(
  formData: FormData,
): Promise<ActionResult<{ sessionId: string }>> {
  await requireSecretary();

  const parsed = sessionSchema.safeParse({
    sessionId: emptyToNull(formData.get("sessionId")),
    hostClubId: formData.get("hostClubId"),
    title: formData.get("title") ?? "",
    bookTitle: formData.get("bookTitle") ?? "",
    bookAuthor: formData.get("bookAuthor") ?? "",
    heldAt: formData.get("heldAt") ?? "",
    location: formData.get("location") ?? "",
    notes: formData.get("notes") ?? "",
    presenter: emptyToNull(formData.get("presenter")),
    pricingKind: formData.get("pricingKind") ?? "free",
    guestFee: emptyToNull(formData.get("guestFee")),
    capacity: emptyToNull(formData.get("capacity")),
    status: formData.get("status") ?? "scheduled",
    videoUrl: formData.get("videoUrl") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid session." };
  }

  const d = parsed.data;

  if (d.pricingKind === "paid" && (!d.guestFee || d.guestFee <= 0)) {
    return { ok: false, error: "A paid session needs a guest fee above zero." };
  }

  // datetime-local gives a naive local string; the column is timestamptz.
  // new Date() interprets it in the SERVER's zone, which is the club's zone in
  // production but may not be in development -- acceptable here, and worth
  // knowing if times ever look shifted by a few hours.
  const heldAtIso = new Date(d.heldAt).toISOString();

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("upsert_session", {
    // Omitted entirely when creating -- the RPC defaults it to null, which is
    // what selects the insert branch.
    ...(d.sessionId ? { p_session_id: d.sessionId } : {}),
    p_host_club_id: d.hostClubId,
    p_title: d.title,
    p_book_title: d.bookTitle,
    p_book_author: d.bookAuthor,
    p_held_at: heldAtIso,
    p_location: d.location || undefined,
    p_notes: d.notes || undefined,
    ...(d.presenter ? { p_presenter: d.presenter } : {}),
    p_pricing_kind: d.pricingKind,
    ...(d.pricingKind === "paid" && d.guestFee != null ? { p_guest_fee: d.guestFee } : {}),
    ...(d.capacity != null ? { p_capacity: d.capacity } : {}),
    p_status: d.status,
    p_video_url: d.videoUrl || undefined,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/sessions");
  revalidatePath("/sessions");
  return { ok: true, data: { sessionId: data as unknown as string } };
}

const CODES = ["attend", "present", "present_other_club", "guest_session"] as const;

const attendanceSchema = z.object({
  sessionId: z.string().uuid(),
  entries: z.array(
    z.object({
      member_id: z.string().uuid(),
      codes: z.array(z.enum(CODES)),
    }),
  ),
});

/**
 * Saves the whole roster in one call.
 *
 * The payload is the FULL desired state, not a diff -- the RPC deletes codes
 * that are absent, so unticking a box and saving actually undoes it. Sending
 * only the ticked members would silently make removals impossible.
 */
export async function saveAttendance(
  sessionId: string,
  entries: { member_id: string; codes: string[] }[],
): Promise<ActionResult> {
  await requireSecretary();

  const parsed = attendanceSchema.safeParse({ sessionId, entries });
  if (!parsed.success) return { ok: false, error: "Invalid attendance data." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("record_session_attendance", {
    p_session_id: parsed.data.sessionId,
    p_entries: parsed.data.entries,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/sessions/${sessionId}/attendance`);
  revalidatePath("/me/points");
  return { ok: true };
}
