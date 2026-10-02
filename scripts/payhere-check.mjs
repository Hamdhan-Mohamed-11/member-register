/**
 * PayHere, end to end, without moving money.
 *
 * Starts a real payment as a member and reads the signed form the app builds
 * -- without letting the browser reach PayHere -- then plays PayHere's part:
 * posts a correctly signed notification to our own notify endpoint and checks
 * the payment settles. Everything it creates, it puts back.
 *
 * The secret never leaves the server: the signature is computed here, on the
 * VPS, from the environment.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { login } from "./lib/e2e.mjs";

const BASE = "https://member.pickabook.lk";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.PAYHERE_MERCHANT_SECRET ?? "";
const MERCHANT = process.env.PAYHERE_MERCHANT_ID ?? "";
const MEMBER = { email: "member@test.pickabook.lk", password: "PickABook!2026" };

const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const api = (p, o = {}) => fetch(`${SB}${p}`, { ...o, headers: { ...h, ...(o.headers || {}) } });
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${d}`); } };

const md5Upper = (v) => createHash("md5").update(v, "utf8").digest("hex").toUpperCase();

/**
 * Polls until a row looks the way it should.
 *
 * The payment row is written by the server action that built the form and the
 * settlement by the notify endpoint, both after the response this script was
 * waiting on -- so a fixed sleep either races them or wastes time.
 */
async function waitFor(read, done, tries = 20) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    last = await read();
    if (done(last)) return last;
    await new Promise((r) => setTimeout(r, 500));
  }
  return last;
}

console.log(`merchant ${MERCHANT}, secret ${SECRET.length} chars, mode ${process.env.PAYHERE_MODE}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let orderRef = null;
let paymentBefore = null;

try {
  await login(page, BASE, MEMBER.email, MEMBER.password, "/feed");

  // Stop the browser ever reaching PayHere, and keep what it was about to
  // send. The form submits itself, so reading the DOM afterwards is too late
  // -- the posted body IS the thing to check.
  let posted = null;
  await page.route("**://*.payhere.lk/**", (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.postData()) {
      posted = {
        action: request.url(),
        ...Object.fromEntries(new URLSearchParams(request.postData())),
      };
    }
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>intercepted</p>" });
  });

  await page.goto(`${BASE}/renew`, { waitUntil: "networkidle" });
  const payButton = page.getByRole("button", { name: /pay|renew|join/i }).first();
  check("there is something to pay for", (await payButton.count()) > 0);
  await payButton.click();
  await page.waitForTimeout(4000);

  const fields = posted;
  check("a checkout was posted to PayHere", Boolean(fields), page.url());
  if (!fields) throw new Error("nothing was posted to PayHere");

  check("it posts to the LIVE PayHere", fields.action === "https://www.payhere.lk/pay/checkout", fields.action);
  check("it carries our merchant id", fields.merchant_id === MERCHANT, fields.merchant_id);
  check("the notify url is ours", fields.notify_url === `${BASE}/api/payhere/notify`, fields.notify_url);
  check("the amount has two decimals", /^\d+\.\d{2}$/.test(fields.amount), fields.amount);

  // The hash PayHere will check: MD5(merchant + order + amount + currency + MD5(secret)).
  const expected = md5Upper(
    fields.merchant_id + fields.order_id + fields.amount + fields.currency + md5Upper(SECRET),
  );
  check("the hash is signed with the live secret", fields.hash === expected, `${fields.hash} vs ${expected}`);

  orderRef = fields.order_id;

  paymentBefore = await waitFor(
    async () =>
      (await j(
        await api(
          `/rest/v1/payments?select=id,status,amount_lkr,purpose,paid_at,member_id&provider_order_ref=eq.${orderRef}`,
        ),
      ))[0] ?? null,
    (row) => row?.status === "pending",
  );
  check("a payment row was written as pending", paymentBefore?.status === "pending", JSON.stringify(paymentBefore));

  // --- now play PayHere ----------------------------------------------------
  const sig = md5Upper(
    fields.merchant_id + orderRef + fields.amount + fields.currency + "2" + md5Upper(SECRET),
  );
  const body = new URLSearchParams({
    merchant_id: fields.merchant_id,
    order_id: orderRef,
    payment_id: `TEST-${Date.now()}`,
    payhere_amount: fields.amount,
    payhere_currency: fields.currency,
    status_code: "2",
    md5sig: sig,
    method: "TEST",
    status_message: "Successfully completed (integration check)",
  });

  const res = await fetch(`${BASE}/api/payhere/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  check("the notify endpoint answered 200", res.status === 200, String(res.status));

  const after = await waitFor(
    async () =>
      (await j(
        await api(
          `/rest/v1/payments?select=status,paid_at,provider_payment_id&provider_order_ref=eq.${orderRef}`,
        ),
      ))[0] ?? null,
    (row) => row?.status === "success",
  );
  check("the payment settled", after?.status === "success" && Boolean(after?.paid_at), JSON.stringify(after));

  const events = await j(await api(`/rest/v1/payment_events?select=signature_ok&provider_order_ref=eq.${orderRef}&order=received_at.desc&limit=1`));
  check("the signature was accepted", events[0]?.signature_ok === true, JSON.stringify(events));

  // --- a forged notification must be refused -------------------------------
  const forged = new URLSearchParams(body);
  forged.set("md5sig", "0".repeat(32));
  forged.set("payment_id", `FORGED-${Date.now()}`);
  await fetch(`${BASE}/api/payhere/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: forged,
  });

  const forgedEvents = await waitFor(
    async () =>
      await j(
        await api(
          `/rest/v1/payment_events?select=signature_ok&provider_order_ref=eq.${orderRef}&order=received_at.desc&limit=1`,
        ),
      ),
    (rows) => rows?.[0]?.signature_ok === false,
  );
  check("a forged signature is rejected", forgedEvents[0]?.signature_ok === false, JSON.stringify(forgedEvents));
} finally {
  await browser.close();

  // No money moved, but the notification this script forged is real to the
  // portal: it settled a membership payment and granted a year. Both are
  // undone here, or the check would quietly hand a member a free year every
  // time it ran.
  if (orderRef) {
    const applied = await j(
      await api(
        `/rest/v1/payment_events?select=outcome&provider_order_ref=eq.${orderRef}&outcome=eq.membership_extended`,
      ),
    );

    if (applied.length > 0 && paymentBefore?.member_id) {
      const memberships = await j(
        await api(
          `/rest/v1/club_memberships?select=id,renewal_date&member_id=eq.${paymentBefore.member_id}&order=updated_at.desc&limit=1`,
        ),
      );
      const membership = memberships[0];
      if (membership?.renewal_date) {
        const back = new Date(`${membership.renewal_date}T00:00:00Z`);
        back.setUTCFullYear(back.getUTCFullYear() - 1);
        await api(`/rest/v1/club_memberships?id=eq.${membership.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ renewal_date: back.toISOString().slice(0, 10) }),
        });
        console.log(`  undone: membership back to ${back.toISOString().slice(0, 10)}`);
      }
    }

    await api(`/rest/v1/payment_events?provider_order_ref=eq.${orderRef}`, { method: "DELETE" });
    await api(`/rest/v1/payments?provider_order_ref=eq.${orderRef}`, { method: "DELETE" });
    console.log(`  undone: ${orderRef} removed`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (orderRef) console.log(`order ref for cleanup: ${orderRef}`);
  if (fail) process.exitCode = 1;
}
