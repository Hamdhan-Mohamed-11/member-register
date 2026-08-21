import "server-only";

import { getServiceSupabaseClient } from "@/lib/supabase/serverClient";
import { getSiteUrl } from "@/lib/supabase/env";

export type InviteSendResult = {
  email: string;
  ok: boolean;
  error?: string;
};

/**
 * Sends the Supabase Auth invite email for an invite row that has already been
 * created by the create_invite RPC.
 *
 * This is one of only three places allowed to use the service-role client:
 * auth.admin.inviteUserByEmail has no SQL equivalent, so the authorisation
 * check lives in the RPC and the send lives here. Callers MUST have already
 * gone through create_invite, which is where the super-admin check actually
 * happens -- this function trusts its caller.
 */
export async function sendInviteEmail(email: string): Promise<InviteSendResult> {
  const supabase = getServiceSupabaseClient();

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/accept-invite`,
  });

  if (error) {
    return { email, ok: false, error: error.message };
  }
  return { email, ok: true };
}

/**
 * Supabase's built-in mailer is rate limited (2/hour by default, and modest
 * even with custom SMTP). A company onboarding of 40 employees sent in a tight
 * loop will trip it partway through and leave half the invites created but
 * unsent -- which looks like nothing happened.
 *
 * So: send serially with a small gap, report per-address, and let the caller
 * show which ones failed rather than failing the whole batch.
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
