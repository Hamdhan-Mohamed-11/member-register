"use server";

import { z } from "zod";
import { sendPasswordResetCode } from "@/lib/auth/otp";

const emailSchema = z.string().trim().toLowerCase().email();

/**
 * Step one of password recovery: email a one-time code.
 *
 * Returns nothing and never fails, on purpose. An unknown address, a
 * throttled one, and a dead mail server are indistinguishable to the caller,
 * because the page says "if that email is registered, a code is on its way"
 * in every case -- anything else lets a stranger test which addresses have
 * accounts.
 */
export async function requestPasswordResetCode(email: string): Promise<void> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return;
  await sendPasswordResetCode(parsed.data);
}
