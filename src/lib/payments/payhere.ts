import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * PayHere hosted checkout.
 *
 * Everything here is MD5-based because PayHere's API is. MD5 is not a security
 * choice we are making -- it is the gateway's protocol, and the secret is what
 * provides the integrity. Requires the Node runtime, so any route using this
 * must set `export const runtime = "nodejs"`.
 */

export type PayHereMode = "sandbox" | "live";

const CHECKOUT_URLS: Record<PayHereMode, string> = {
  sandbox: "https://sandbox.payhere.lk/pay/checkout",
  live: "https://www.payhere.lk/pay/checkout",
};

export function getPayHereMode(): PayHereMode {
  const raw = process.env.PAYHERE_MODE;
  // Never derive this from NODE_ENV: staging must be able to point at live for
  // a smoke test, and production must be pinnable to sandbox during a rollout.
  return raw === "live" ? "live" : "sandbox";
}

export function getCheckoutUrl(): string {
  return CHECKOUT_URLS[getPayHereMode()];
}

export function isPayHereConfigured(): boolean {
  return Boolean(process.env.PAYHERE_MERCHANT_ID && process.env.PAYHERE_MERCHANT_SECRET);
}

function requireMerchantId(): string {
  const v = process.env.PAYHERE_MERCHANT_ID;
  if (!v) throw new Error("Missing required environment variable: PAYHERE_MERCHANT_ID");
  return v;
}

function requireMerchantSecret(): string {
  const v = process.env.PAYHERE_MERCHANT_SECRET;
  if (!v) throw new Error("Missing required environment variable: PAYHERE_MERCHANT_SECRET");
  return v;
}

const md5Upper = (value: string): string =>
  createHash("md5").update(value, "utf8").digest("hex").toUpperCase();

/**
 * Formats an amount the way PayHere requires: exactly two decimals, no
 * thousands separator.
 *
 * This is THE classic failure of this integration. Sending `3000` or
 * `3,000.00` where `3000.00` is expected produces "Unauthorized payment
 * request" with no further explanation, and the cause is invisible. Format
 * ONCE and use the identical string in both the form field and the hash --
 * formatting twice is how they drift.
 */
export function formatAmount(amount: number | string): string {
  return Number(amount).toFixed(2);
}

export type CheckoutFields = {
  action: string;
  fields: Record<string, string>;
};

/**
 * Builds the signed field set for the auto-submitting checkout form.
 *
 * hash = UPPER(MD5(
 *   merchant_id + order_id + amount + currency + UPPER(MD5(merchant_secret))
 * ))
 */
export function buildCheckout(input: {
  orderRef: string;
  amount: number | string;
  currency?: string;
  itemDescription: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
}): CheckoutFields {
  const merchantId = requireMerchantId();
  const secret = requireMerchantSecret();
  const currency = input.currency ?? "LKR";

  // Formatted once, used twice. Do not inline Number(...).toFixed(2) below.
  const amount = formatAmount(input.amount);

  const hash = md5Upper(
    merchantId + input.orderRef + amount + currency + md5Upper(secret),
  );

  return {
    action: getCheckoutUrl(),
    fields: {
      merchant_id: merchantId,
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      notify_url: input.notifyUrl,
      order_id: input.orderRef,
      items: input.itemDescription,
      currency,
      amount,
      first_name: input.firstName || "Member",
      last_name: input.lastName || "-",
      email: input.email,
      phone: input.phone ?? "",
      address: input.address ?? "-",
      city: input.city ?? "-",
      country: input.country ?? "Sri Lanka",
      hash,
    },
  };
}

/**
 * Verifies a notification's md5sig.
 *
 * md5sig = UPPER(MD5(
 *   merchant_id + order_id + payhere_amount + payhere_currency + status_code
 *   + UPPER(MD5(merchant_secret))
 * ))
 *
 * Note the amount here is PayHere's own `payhere_amount` string, used verbatim
 * -- re-formatting it would change the bytes being hashed and break every
 * comparison.
 */
export function verifyNotification(params: {
  merchantId: string;
  orderRef: string;
  amount: string;
  currency: string;
  statusCode: string;
  signature: string;
}): boolean {
  const secret = requireMerchantSecret();

  const expected = md5Upper(
    params.merchantId +
      params.orderRef +
      params.amount +
      params.currency +
      params.statusCode +
      md5Upper(secret),
  );

  const given = (params.signature ?? "").toUpperCase();

  // Constant-time compare. Length must match first -- timingSafeEqual throws
  // on differing lengths, and the length itself is not secret.
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"));
}

/** PayHere status codes. */
export const PAYHERE_STATUS = {
  SUCCESS: 2,
  PENDING: 0,
  CANCELLED: -1,
  FAILED: -2,
  CHARGEDBACK: -3,
} as const;
