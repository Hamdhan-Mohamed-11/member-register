"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";
import { getSiteUrl } from "@/lib/supabase/env";
import { sendMail } from "@/lib/email/mailer";
import { borrowApprovedEmail } from "@/lib/email/templates";

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "issued", "returned", "rejected"]),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * Moves a borrow request along: approve, hand over, take back, decline.
 *
 * The authorisation is re-checked inside set_borrow_status via is_admin(), so
 * requireStaff here is about not showing a stranger the page, not about
 * being the control. The RPC also writes the audit row and notifies the
 * member, which is why this action is so thin -- doing either of those here
 * would mean a psql fix-up silently skipped them.
 */
export async function setBorrowStatus(formData: FormData): Promise<ActionResult> {
  await requireStaff();

  const parsed = schema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    dueOn: formData.get("dueOn") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid change." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("set_borrow_status", {
    p_id: parsed.data.id,
    p_status: parsed.data.status,
    p_due_on: parsed.data.dueOn,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, error: error.message };

  if (parsed.data.status === "approved") {
    await tellTheMember(supabase, parsed.data.id, parsed.data.dueOn ?? null);
  }

  revalidatePath("/admin/library");
  return { ok: true };
}

/**
 * Emails the member that their book is waiting for them.
 *
 * The in-app notification is written by the RPC, but the place they collect
 * from is a physical office, so someone who is not in the portal that week
 * would never learn the book is ready. The send is deliberately swallowed:
 * the approval is already recorded, and failing the action over a mail server
 * would make an admin click approve twice.
 */
async function tellTheMember(
  supabase: Awaited<ReturnType<typeof getActionSupabase>>,
  requestId: string,
  dueOn: string | null,
): Promise<void> {
  try {
    const [{ data: request }, { data: settings }] = await Promise.all([
      supabase
        .from("borrow_requests")
        .select(
          "title, author, due_on, profiles!borrow_requests_member_id_fkey ( first_name, email )",
        )
        .eq("id", requestId)
        .maybeSingle(),
      supabase.from("app_settings").select("library_collect_at").eq("id", 1).maybeSingle(),
    ]);

    const member = (request as { profiles?: { first_name: string; email: string } | null } | null)
      ?.profiles;
    if (!request || !member?.email) return;

    await sendMail(
      borrowApprovedEmail({
        to: member.email,
        firstName: member.first_name,
        bookTitle: request.title,
        bookAuthor: request.author,
        dueOn: dueOn ?? request.due_on,
        collectAt: settings?.library_collect_at ?? null,
        link: `${getSiteUrl()}/library`,
      }),
    );
  } catch (error) {
    console.error("[library] borrow approval email:", error);
  }
}
