"use server";

import { revalidatePath } from "next/cache";
import { clubLocalToIso } from "@/lib/time";
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
  label: z.string().trim().max(40, "Keep the label under 40 characters"),
  tagline: z.string().trim().max(140, "Keep the tagline under 140 characters"),
  highlights: z.array(z.string().trim().max(80, "Keep each point under 80 characters")).max(3),
  presenter: z.string().uuid().nullable(),
  pricingKind: z.enum(["free", "paid"]),
  guestFee: z.coerce.number().min(0).nullable(),
  capacity: z.coerce.number().int().min(1).nullable(),
  presenterCount: z.coerce.number().int().min(1).max(50).nullable(),
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
    label: formData.get("label") ?? "",
    tagline: formData.get("tagline") ?? "",
    highlights: formData.getAll("highlight").map((v) => String(v)),
    presenter: emptyToNull(formData.get("presenter")),
    pricingKind: formData.get("pricingKind") ?? "free",
    guestFee: emptyToNull(formData.get("guestFee")),
    capacity: emptyToNull(formData.get("capacity")),
    presenterCount: emptyToNull(formData.get("presenterCount")),
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
  // Read it as Sri Lanka time explicitly. `new Date(d.heldAt)` used the
  // server's zone, which in production is UTC, and stored every session five
  // and a half hours late.
  const heldAtIso = clubLocalToIso(d.heldAt);

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
    // Omitted when blank, and that IS the clear: the SQL default is null, and
    // the update branch writes null straight to presenter_count. So an empty
    // field removes the limit rather than leaving the old one behind.
    p_presenter_count: d.presenterCount ?? undefined,
    p_status: d.status,
    p_video_url: d.videoUrl || undefined,
  });

  if (error) return { ok: false, error: error.message };

  const sessionId = data as unknown as string;

  // The page copy -- label, tagline, what to expect -- goes through its own
  // RPC (see migration 0038), with the same club check as the save above.
  const { error: detailsError } = await supabase.rpc("set_session_details", {
    p_session_id: sessionId,
    p_label: d.label || undefined,
    p_tagline: d.tagline || undefined,
    p_highlights: d.highlights.filter(Boolean),
  });
  if (detailsError) {
    return { ok: false, error: `Session saved, but its details did not: ${detailsError.message}` };
  }

  revalidatePath("/admin/sessions");
  revalidatePath("/sessions");
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true, data: { sessionId } };
}

/**
 * Attaches the cover picture a club uploaded to a session, or clears it.
 *
 * The file goes straight from the browser into the flyers bucket, whose
 * policy already limits writes to staff of the session's club; the RPC
 * re-checks that, and that the key sits under this session's folder.
 */
export async function setSessionImage(
  sessionId: string,
  path: string | null,
): Promise<ActionResult> {
  await requireSecretary();
  if (!z.string().uuid().safeParse(sessionId).success) {
    return { ok: false, error: "Unknown session." };
  }
  if (path != null && (path.length < 3 || path.length > 400)) {
    return { ok: false, error: "Invalid file." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("set_session_image", {
    p_session_id: sessionId,
    p_path: path ?? undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/sessions");
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath("/sessions");
  revalidatePath("/feed");
  return { ok: true };
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
