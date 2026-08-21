import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase/serverClient";
import { verifyNotification } from "@/lib/payments/payhere";
import { clientKey, rateLimit } from "@/lib/security/rateLimit";

// MD5 needs node:crypto. Without this the route may be bundled for an
// environment that has no such module.
export const runtime = "nodejs";

// Generous: PayHere legitimately retries, and several members can be paying at
// once. This is here to stop a flood filling payment_events, not to police
// normal traffic.
const NOTIFY_LIMIT = 60;
const NOTIFY_WINDOW_MS = 60_000;

/**
 * PayHere server-to-server notification.
 *
 * The application's only genuinely public write endpoint, and the one with the
 * worst failure mode: if this stops working, payments quietly stop settling
 * and nothing in the UI says so.
 *
 * Three things about it are load-bearing:
 *
 *  1. It is EXCLUDED from the proxy matcher in src/proxy.ts. PayHere sends no
 *     cookies. If the auth proxy catches this path, every notification gets
 *     307'd to /login, the POST body is dropped, and settlement silently dies.
 *
 *  2. It always answers 200 once the body has been logged, even for a bad
 *     signature. A non-2xx triggers PayHere retries that can never succeed,
 *     and a 500 leaks that something is wrong. Rejection is recorded in
 *     payment_events.signature_ok, not signalled over the wire.
 *
 *  3. The body is application/x-www-form-urlencoded, NOT JSON.
 */
export async function POST(request: NextRequest) {
  // Answer 200 even when limiting. A 429 would make PayHere retry harder, and
  // the retry is the thing being limited.
  const limit = rateLimit(clientKey(request, "payhere-notify"), NOTIFY_LIMIT, NOTIFY_WINDOW_MS);
  if (!limit.allowed) {
    console.warn("[payhere:notify] rate limited", limit.retryAfterSeconds);
    return NextResponse.json({ ok: true });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // Nothing parseable to log against. 200 anyway -- retrying will not help.
    return NextResponse.json({ ok: true });
  }

  const get = (key: string) => String(form.get(key) ?? "");

  const merchantId = get("merchant_id");
  const orderRef = get("order_id");
  const amount = get("payhere_amount");
  const currency = get("payhere_currency");
  const statusCode = get("status_code");
  const signature = get("md5sig");
  const paymentId = get("payment_id");

  const payload: Record<string, string> = {};
  for (const [k, v] of form.entries()) payload[k] = String(v);

  let signatureOk = false;
  try {
    signatureOk =
      Boolean(orderRef) &&
      merchantId === process.env.PAYHERE_MERCHANT_ID &&
      verifyNotification({ merchantId, orderRef, amount, currency, statusCode, signature });
  } catch {
    // Missing secret in the environment. Treat as unverified rather than
    // throwing -- the event still needs recording.
    signatureOk = false;
  }

  // Service role: no user session exists on this request, by design.
  // apply_payhere_notification is granted to service_role only, so a signed-in
  // user cannot invoke settlement even with a crafted call.
  const supabase = getServiceSupabaseClient();

  const { error } = await supabase.rpc("apply_payhere_notification", {
    p_order_ref: orderRef,
    p_payment_id: paymentId,
    p_status_code: Number.isFinite(Number(statusCode)) ? Number(statusCode) : -2,
    p_amount: Number(amount),
    p_currency: currency || "LKR",
    p_signature_ok: signatureOk,
    p_payload: payload,
  });

  if (error) {
    // Stable prefix so this is greppable in the VPS logs, which is where this
    // will be diagnosed from.
    console.error("[payhere:notify] settlement failed", orderRef, error.message);
  }

  return NextResponse.json({ ok: true });
}
