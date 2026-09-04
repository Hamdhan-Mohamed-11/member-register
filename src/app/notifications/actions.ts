"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMember } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

/**
 * Both actions write `read_at` and nothing else, which is all the column-scoped
 * UPDATE grant in migration 0019 permits. RLS restricts the rows to the
 * caller's own, so neither needs -- or should have -- a member_id filter of its
 * own: a filter here would look like the thing keeping other people's
 * notifications safe, and invite someone to relax it.
 */

const openSchema = z.object({
  id: z.string().uuid(),
  // Where to send them afterwards. Validated as an in-app path even though the
  // database already constrains href to `/%`: this arrives from a form field,
  // and a redirect() to an attacker-chosen absolute URL is an open redirect.
  href: z
    .string()
    .trim()
    .regex(/^\/(?!\/)[\w\-./?=&%#]*$/, "not an in-app path")
    .optional(),
});

/**
 * Marks one notification read, then follows it. A <form> rather than a link so
 * the row works with JavaScript disabled and needs no client component.
 */
export async function openNotification(formData: FormData): Promise<void> {
  await requireActiveMember();

  const parsed = openSchema.safeParse({
    id: formData.get("id") ?? "",
    href: formData.get("href") || undefined,
  });

  // A malformed row id is not worth an error page -- the member pressed a
  // notification, so put them somewhere sensible.
  if (!parsed.success) redirect("/notifications");

  const supabase = await getActionSupabase();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .is("read_at", null);

  revalidatePath("/notifications");

  // redirect() throws, so it must be the last thing and outside any try.
  redirect(parsed.data.href ?? "/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  await requireActiveMember();

  const supabase = await getActionSupabase();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  revalidatePath("/notifications");
  redirect("/notifications");
}
