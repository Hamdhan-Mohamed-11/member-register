import "server-only";

import { getServiceSupabaseClient } from "@/lib/supabase/serverClient";
import { getSiteUrl } from "@/lib/supabase/env";
import { sendMail } from "@/lib/email/mailer";
import { inviteEmail } from "@/lib/email/templates";

export type InviteSendResult = {
  email: string;
  ok: boolean;
  error?: string;
};

/**
 * Sends the invite email for an invite row that has already been created by
 * the create_invite RPC.
 *
 * Mail is composed and sent by this app (nodemailer), like every other auth
 * email. GoTrue still creates the invited user and mints the link -- that is
 * what `generateLink` does, and it is the same link inviteUserByEmail would
 * have sent; only delivery moved. Nothing here depends on GoTrue's SMTP being
 * configured any more.
 *
 * Still service-role, and still one of the sanctioned uses: generateLink has
 * no SQL equivalent, so the authorisation check lives in the RPC and the send
 * lives here. Callers MUST have already gone through create_invite, which is
 * where the super-admin check actually happens -- this function trusts its
 * caller.
 */
export async function sendInviteEmail(email: string): Promise<InviteSendResult> {
  const supabase = getServiceSupabaseClient();

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${getSiteUrl()}/auth/accept-invite` },
  });

  if (error) {
    return { email, ok: false, error: error.message };
  }

  const actionLink = data?.properties?.action_link;
  if (!actionLink) {
    return { email, ok: false, error: "Auth returned no invite link." };
  }

  try {
    await sendMail(inviteEmail({ to: email, actionLink }));
  } catch (sendError) {
    // The user and the invite row exist but the mail did not go. Report it per
    // address so the admin sees which ones to resend, rather than a whole
    // batch failing or silently half-working.
    const message = sendError instanceof Error ? sendError.message : String(sendError);
    return { email, ok: false, error: `Invite created but email failed: ${message}` };
  }

  return { email, ok: true };
}

/**
 * Serial, with a gap, and reported per address.
 *
 * The old reason was Supabase's built-in mailer and its 2/hour cap. That cap
 * is gone with the mail, but the shape is still right: a company onboarding of
 * 40 employees hitting one SMTP relay in a tight loop is exactly what gets a
 * sender throttled or graylisted, and a batch that fails halfway leaves
 * invites created but unsent -- which looks like nothing happened. So the
 * caller gets per-address results and can show which ones need resending.
 */
export async function sendInviteEmails(
  emails: string[],
  gapMs = 400,
): Promise<InviteSendResult[]> {
  const results: InviteSendResult[] = [];

  for (const [index, email] of emails.entries()) {
    results.push(await sendInviteEmail(email));
    if (index < emails.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
  }

  return results;
}

/**
 * Splits a pasted blob of addresses -- one per line, comma separated, or the
 * "Name <a@b.com>" form Outlook and Gmail produce when you copy a recipient
 * list. Deduplicates case-insensitively and keeps only plausible addresses.
 */
export function parseEmailList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const chunk of raw.split(/[\n,;]+/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    // "Ada Lovelace <ada@example.com>" -> "ada@example.com"
    const angled = trimmed.match(/<([^>]+)>/);
    const candidate = (angled ? angled[1] : trimmed).trim().toLowerCase();

    // Deliberately loose. Real validation is the invite email arriving; a
    // strict regex here mostly rejects addresses that are actually fine.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) continue;

    if (!seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }

  return out;
}
