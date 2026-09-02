/**
 * Starting a payment, through the real UI.
 *
 * scripts/payments-test.mjs covers the RPCs and the webhook. This covers the
 * layer between them — the server action and the auto-submitting checkout form
 * — which had no test at all, and where a bug did in fact live: `actions.ts`
 * re-exported a non-async helper, and EVERY export from a "use server" file
 * must be an async function. That throws at runtime rather than at build, so
 * only clicking the button finds it.
 *
 * The far end is PayHere itself. With placeholder credentials it answers
 * "Unauthorized payment request", which proves the form reached them and was
 * parsed — but NOT that the hash is right, since that message covers both an
 * unknown merchant and a bad signature. Real credentials are what settle that.
 *
 * Requires: dev server on :3001. Cleans up after itself.
 * Run: npm run test:payments:e2e
 */
import { chromium } from "playwright";
import { login, relaxTimeouts, settle, visibleText } from "./lib/e2e.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "TestPassw0rd!2026";

if (!URL_ || !SVC) {
  console.error("Missing Supabase env. Run via `npm run test:payments:e2e`.");
  process.exit(2);
}

const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const admin = (p, o = {}) => fetch(`${URL_}${p}`, { ...o, headers: { ...svcH, ...(o.headers || {}) } });
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

const MEMBER = "payui@payui.test";

async function wipe() {
  const { users = [] } = await j(await admin("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@payui.test")) {
      // Payments keep a snapshot and null the link, so deletion is allowed.
      await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
  await admin("/rest/v1/payments?member_id=is.null&member_email=like.*%40payui.test", { method: "DELETE" });
  await admin("/rest/v1/clubs?slug=eq.payui-club", { method: "DELETE" });
}

console.log("Preparing...");
await wipe();

const pub = (await j(await admin("/rest/v1/clubs?slug=eq.public-club&select=id")))[0];
await admin("/rest/v1/clubs", {
  method: "POST", headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    name: "Pay UI Club", slug: "payui-club", kind: "public",
    membership_fee_lkr: 1750, term_months: 12,
  }),
});

const user = await j(await admin("/auth/v1/admin/users", {
  method: "POST", body: JSON.stringify({ email: MEMBER, password: PW, email_confirm: true }),
}));
await admin(`/rest/v1/profiles?id=eq.${user.id}`, {
  method: "PATCH",
  body: JSON.stringify({ status: "active", first_name: "Pay", last_name: "Uitest" }),
});
await admin("/rest/v1/club_memberships", {
  method: "POST",
  body: JSON.stringify({
    member_id: user.id, club_id: pub.id, status: "active",
    is_primary: true, joined_on: "2026-01-01", renewal_date: "2027-01-01",
  }),
});

const browser = await chromium.launch();
relaxTimeouts(browser);

const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();

const cspViolations = [];
page.on("console", (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to/i.test(t)) cspViolations.push(t);
});
const navigations = [];
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) navigations.push(f.url());
});

await login(page, BASE, MEMBER, PW);

await page.goto(`${BASE}/renew`, { waitUntil: "domcontentloaded" });
await settle(page, "/renew");
check("the renew page loads", page.url().endsWith("/renew"), page.url());

const body = await visibleText(page);
check("their existing club is listed with a renew price",
  /Renew · LKR/.test(body ?? ""), body?.slice(0, 200));
check("a club they are not in is offered to join",
  /Pay UI Club/.test(body ?? "") && /Join · LKR 1,750/.test(body ?? ""), body?.slice(0, 300));

await page.click('button:has-text("Join · LKR 1,750")');
await page.waitForTimeout(9000);

// The server action ran and priced it.
const payments = await j(await admin(
  `/rest/v1/payments?member_id=eq.${user.id}&select=provider_order_ref,status,amount_lkr,club_name,member_email`));
check("the server action created a payment", payments.length === 1, JSON.stringify(payments));
check("priced from the club, not the page",
  Number(payments[0]?.amount_lkr) === 1750, JSON.stringify(payments[0]));
check("it starts pending", payments[0]?.status === "pending", JSON.stringify(payments[0]));
check("the snapshot fields are populated",
  payments[0]?.member_email === MEMBER && payments[0]?.club_name === "Pay UI Club",
  JSON.stringify(payments[0]));

// The form actually submitted cross-origin -- this is what the CSP form-action
// directive has to permit, and getting it wrong fails silently.
check("the browser reached PayHere's checkout",
  navigations.some((u) => u.includes("payhere.lk/pay/checkout")),
  JSON.stringify(navigations.slice(-3)));
check("no CSP violation blocked the submission",
  cspViolations.length === 0, JSON.stringify(cspViolations.slice(0, 3)));

// This used to assert that PayHere REJECTED us: with placeholder credentials
// the reply was "Unauthorized payment request", and reaching that page at
// least proved the form had submitted. Real credentials landed on 1 Sep 2026
// and it now returns a genuine checkout, so the old assertion started failing
// because the thing it was written around got fixed.
//
// Assert the real checkout instead, and assert the rejection is ABSENT --
// "Unauthorized payment request" is what a wrong merchant id OR a bad hash
// looks like, and it is the failure this whole path exists to catch.
const atPayHere = await visibleText(page).catch(() => "");
check("PayHere returned a real checkout page, not an authorisation rejection",
  /sandbox/i.test(atPayHere ?? "") && !/unauthoriz/i.test(atPayHere ?? ""),
  atPayHere?.slice(0, 160));
check("the checkout is in SANDBOX, not live",
  /payments are not actually processed/i.test(atPayHere ?? ""),
  atPayHere?.slice(0, 160));

await browser.close();

if (!process.env.KEEP) { console.log("\nCleaning up..."); await wipe(); }
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
