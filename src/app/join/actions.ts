"use server";

import { z } from "zod";
import { sendSignupCode, type OtpSendResult } from "@/lib/auth/otp";

export type SignupCodeResult = { ok: true } | { ok: false; error: string };

const MIN_PASSWORD_LENGTH = 10;

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Please use a password of at least ${MIN_PASSWORD_LENGTH} characters.`),
  firstName: z.string().trim().min(1, "Please enter your first name.").max(80),
  lastName: z.string().trim().max(80),
});

const MESSAGES: Record<Exclude<OtpSendResult, { ok: true }>["reason"], string> = {
  exists: "There's already an account with that email. Try logging in instead.",
  weak_password: `Please use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  rate_limited:
    "Too many codes requested for that address. Please wait a few minutes and try again.",
  failed: "We couldn't send your code. Please check the address and try again.",
};

/**
 * Step one of signup: create the unconfirmed account and email its code.
 *
 * Runs on the server because minting the code needs the service-role key. The
 * password crosses the wire once, over HTTPS, in the action payload -- the
 * same trip a browser-side signUp would have made.
 *
 * Also the resend: calling it again with the same details reissues the code.
 * The club choice is deliberately NOT accepted here. It is applied after the
 * code is verified, by request_club_join under the member's own session, so
 * this action can never create a membership for an unverified address.
 */
export async function requestSignupCode(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<SignupCodeResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const result = await sendSignupCode(parsed.data);
  return result.ok ? { ok: true } : { ok: false, error: MESSAGES[result.reason] };
}
