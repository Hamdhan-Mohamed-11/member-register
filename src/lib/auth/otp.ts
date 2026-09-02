import "server-only";

import { headers } from "next/headers";
import { getServiceSupabaseClient } from "@/lib/supabase/serverClient";
import { sendMail } from "@/lib/email/mailer";
import { passwordResetCodeEmail, signupCodeEmail } from "@/lib/email/templates";
import { rateLimit } from "@/lib/security/rateLimit";

/**
 * Email one-time codes for signup confirmation and password recovery.
 *
 * The codes are NOT ours. `auth.admin.generateLink` makes GoTrue mint exactly
 * the same token it would have emailed itself and hand it back instead of
 * sending it -- so expiry, single use, and verification all stay inside Auth,
 * against auth.users, where they belong. This module only carries the code to
 * the member's inbox over our own SMTP. There is no OTP table here, and there
 * must not be one: a second, home-made token store would be the weakest link
 * in the whole login path.
 *
 * The matching client call is supabase.auth.verifyOtp({ email, token, type }),
 * which is what actually establishes the session.
 *
 * This is the fourth sanctioned use of the service-role client (see
 * lib/supabase/serverClient.ts): generateLink is admin-only and has no SQL
 * equivalent. It is safe here because it acts solely on the address the caller
 * typed and its only effect is an email to that address -- it grants nothing
 * to the caller, who still has to read the mailbox to get anywhere.
 */

/**
 * Must match `otp_expiry` in supabase/config.toml (600s) -- this constant only
 * decides what the email SAYS, so if the two drift, the message lies about how
 * long the member has.
 */
export const OTP_EXPIRY_MINUTES = 10;

/**
 * Codes are digits, but HOW MANY digits is GoTrue's `otp_length`, and it is
 * not the same everywhere: supabase/config.toml sets 6 for local, and the
 * hosted project issues 8. Nothing here or in the UI may assume a length --
 * the code entry accepts any plausible run of digits and lets Auth be the
 * judge. Hardcoding 6 would have made every real signup impossible to submit.
 */

export type OtpSendResult =
  | { ok: true }
  | { ok: false; reason: "exists" | "weak_password" | "rate_limited" | "failed" };

/**
 * Per-address and per-IP throttle.
 *
 * Two separate limits because they stop different things: the address limit
 * stops someone using the signup form to mailbomb one person, and the IP limit
 * stops a script cycling addresses. Both are in-process (see rateLimit.ts) --
 * adequate for one VPS process, and not the only control: GoTrue expires and
 * single-uses the code regardless.
 */
async function throttle(scope: string, email: string): Promise<boolean> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";

  const perEmail = rateLimit(`${scope}:email:${email}`, 3, 15 * 60_000);
  const perIp = rateLimit(`${scope}:ip:${ip}`, 10, 15 * 60_000);
  return perEmail.allowed && perIp.allowed;
}

function isAlreadyRegistered(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes("already registered") || text.includes("already been registered");
}

/**
 * Creates the pending account and emails its confirmation code.
 *
 * The account exists in auth.users from this point on, unconfirmed, and
 * handle_new_user has already written the `pending` profile row -- names
 * included, which is why they are passed through as user metadata here.
 * Nothing about the member is usable until the code is verified: unconfirmed
 * users cannot sign in, so an unverified row grants nothing.
 *
 * Calling it again for the same unconfirmed address is the resend path --
 * GoTrue reissues the code and the old one stops working.
 */
export async function sendSignupCode(args: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<OtpSendResult> {
  if (!(await throttle("signup-otp", args.email.toLowerCase()))) {
    return { ok: false, reason: "rate_limited" };
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "signup",
    email: args.email,
    password: args.password,
    options: { data: { first_name: args.firstName, last_name: args.lastName } },
  });

  if (error) {
    if (isAlreadyRegistered(error.message)) return { ok: false, reason: "exists" };
    if (error.message.toLowerCase().includes("password")) {
      return { ok: false, reason: "weak_password" };
    }
    console.error("signup otp: generateLink failed", error.message);
    return { ok: false, reason: "failed" };
  }

  const code = data?.properties?.email_otp;
  if (!code) {
    console.error("signup otp: no email_otp in generateLink response");
    return { ok: false, reason: "failed" };
  }

  try {
    await sendMail(
      signupCodeEmail({
        to: args.email,
        code,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
        firstName: args.firstName,
      }),
    );
  } catch (sendError) {
    // The account row now exists but the member never got the code. Say so:
    // silently claiming success would strand them on a code screen forever,
    // and they can retry, which reissues.
    console.error("signup otp: SMTP send failed", sendError);
    return { ok: false, reason: "failed" };
  }

  return { ok: true };
}

/**
 * Emails a recovery code, if that address has an account.
 *
 * Always resolves as if it worked. Every failure below -- unknown address,
 * throttled, SMTP down -- returns the same thing, because the caller renders
 * the same "check your email" either way; reporting them apart would turn this
 * form into an account-enumeration oracle. Failures are logged, not shown.
 */
export async function sendPasswordResetCode(email: string): Promise<void> {
  if (!(await throttle("recovery-otp", email.toLowerCase()))) return;

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error || !data?.properties?.email_otp) {
    // Unknown address lands here, and so does a real fault. Logged at the same
    // level deliberately -- the caller is told nothing either way.
    console.warn("recovery otp: no code generated", error?.message ?? "no email_otp");
    return;
  }

  try {
    await sendMail(
      passwordResetCodeEmail({
        to: email,
        code: data.properties.email_otp,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      }),
    );
  } catch (sendError) {
    console.error("recovery otp: SMTP send failed", sendError);
  }
}
