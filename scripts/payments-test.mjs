/**
 * Payments: settlement, idempotency and the renewal maths.
 *
 * This posts SYNTHETIC notifications at the real /api/payhere/notify endpoint,
 * signed with the local test secret. That exercises the signature check, the
 * webhook, the RPC and the side effects — everything except PayHere itself
 * actually calling us, which cannot happen against localhost.
 *
 * The things that must never be wrong:
 *
 *   1. Replaying a notification must not settle twice. PayHere RETRIES; a
 *      duplicate advancing a renewal date by a second term is money-adjacent
 *      and silent.
 *   2. A tampered amount must be refused even with a valid signature.
 *   3. Renewing early must EXTEND, not restart — otherwise the member loses
 *      the time they already paid for.
 *
 * Run: npm run test:payments
 */
import { createHash } from "node:crypto";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MID = process.env.PAYHERE_MERCHANT_ID;
const SECRET = process.env.PAYHERE_MERCHANT_SECRET;
const PW = "TestPassw0rd!2026";

if (!URL_ || !ANON || !SVC || !MID || !SECRET) {
  console.error("Missing env. Run via `npm run test:payments`.");
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

const md5Upper = (s) => createHash("md5").update(s, "utf8").digest("hex").toUpperCase();

/** Mirrors what PayHere posts, signed the way PayHere signs it. */
async function notify({ orderRef, amount, statusCode = 2, paymentId, badSignature = false }) {
  const amountStr = Number(amount).toFixed(2);
  const currency = "LKR";
  const sig = md5Upper(
    MID + orderRef + amountStr + currency + String(statusCode) + md5Upper(SECRET),
  );

  const body = new URLSearchParams({
    merchant_id: MID,
    order_id: orderRef,
    payhere_amount: amountStr,
    payhere_currency: currency,
    status_code: String(statusCode),
    md5sig: badSignature ? "0".repeat(32) : sig,
    payment_id: paymentId ?? `PH${Date.now()}`,
  });

  const res = await fetch(`${BASE}/api/payhere/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return res.status;
}

async function signIn(email) {
  const d = await j(await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  }));
  if (!d.access_token) throw new Error(`signIn ${email}: ${JSON.stringify(d)}`);
  return d.access_token;
}

async function rpc(token, name, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, body: await j(res) };
}

const MEMBER = "payer@rlstest.local";
const ADMIN = "payadmin@rlstest.local";

async function wipe() {
  const { users = [] } = await j(await admin("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@rlstest.local")) {
      await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
  await admin("/rest/v1/clubs?slug=eq.pay-club", { method: "DELETE" });
}

console.log("Preparing...");
await wipe();

const payClub = (await j(await admin("/rest/v1/clubs", {
  method: "POST", headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    name: "Pay Test Club", slug: "pay-club", kind: "public",
    membership_fee_lkr: 2500, term_months: 12,
  }),
})))[0];

const ids = {};
for (const [email, role] of [[MEMBER, "member"], [ADMIN, "super_admin"]]) {
  const u = await j(await admin("/auth/v1/admin/users", {
    method: "POST", body: JSON.stringify({ email, password: PW, email_confirm: true }),
  }));
  ids[email] = u.id;
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active", role, first_name: "Pay", last_name: "Test" }),
  });
}

const tokMember = await signIn(MEMBER);
const tokAdmin = await signIn(ADMIN);

// --- starting a payment ---------------------------------------------------
console.log("\n--- starting a payment ---");

const start = await rpc(tokMember, "start_club_membership_payment", { p_club_id: payClub.id });
check("a member can start a club payment", start.status < 300, JSON.stringify(start));

const row = Array.isArray(start.body) ? start.body[0] : start.body;
check("the amount comes from the club, not the client",
  Number(row?.amount) === 2500, JSON.stringify(row));
check("it reports this is a new join, not a renewal", row?.is_renewal === false, JSON.stringify(row));
check("a reference was generated", /^MB-[A-Z0-9]{10}$/.test(row?.order_ref ?? ""), row?.order_ref);

const forged = await fetch(`${URL_}/rest/v1/payments`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${tokMember}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    purpose: "club_membership", member_id: ids[MEMBER], club_id: payClub.id,
    provider_order_ref: "MB-FORGED0001", amount_lkr: 1,
  }),
});
check("a member CANNOT write their own payment row", forged.status >= 400, String(forged.status));

// --- signature and amount checks -----------------------------------------
console.log("\n--- rejecting bad notifications ---");

await notify({ orderRef: row.order_ref, amount: 2500, badSignature: true });
let pay = (await j(await admin(`/rest/v1/payments?provider_order_ref=eq.${row.order_ref}&select=status`)))[0];
check("a bad signature does not settle the payment", pay?.status === "pending", JSON.stringify(pay));

let events = await j(await admin(
  `/rest/v1/payment_events?provider_order_ref=eq.${row.order_ref}&select=signature_ok,applied,outcome`));
check("the rejected notification was still logged",
  events.some((e) => e.signature_ok === false && e.outcome === "bad_signature"),
  JSON.stringify(events));

await notify({ orderRef: row.order_ref, amount: 1 });
pay = (await j(await admin(`/rest/v1/payments?provider_order_ref=eq.${row.order_ref}&select=status`)))[0];
check("a valid signature over a TAMPERED amount is refused",
  pay?.status === "pending", JSON.stringify(pay));
events = await j(await admin(
  `/rest/v1/payment_events?provider_order_ref=eq.${row.order_ref}&select=outcome`));
check("the mismatch was logged",
  events.some((e) => e.outcome === "amount_mismatch"), JSON.stringify(events));

const unknown = await notify({ orderRef: "MB-DOESNOTEXIST", amount: 100 });
check("an unknown reference answers 200 anyway (no retry storm)", unknown === 200, String(unknown));

// --- successful settlement ------------------------------------------------
console.log("\n--- settlement ---");

const httpStatus = await notify({ orderRef: row.order_ref, amount: 2500, paymentId: "PH-FIRST" });
check("the webhook answers 200", httpStatus === 200, String(httpStatus));

pay = (await j(await admin(`/rest/v1/payments?provider_order_ref=eq.${row.order_ref}&select=*`)))[0];
check("the payment is marked successful", pay?.status === "success", JSON.stringify(pay?.status));
check("PayHere's payment id was stored", pay?.provider_payment_id === "PH-FIRST", pay?.provider_payment_id);

let membership = (await j(await admin(
  `/rest/v1/club_memberships?member_id=eq.${ids[MEMBER]}&club_id=eq.${payClub.id}&select=*`)))[0];
check("the club membership was created", membership?.status === "active", JSON.stringify(membership));
check("it is their primary club", membership?.is_primary === true, JSON.stringify(membership));

const firstRenewal = membership?.renewal_date;
const expected = new Date();
expected.setMonth(expected.getMonth() + 12);
check("the renewal date is one term out",
  firstRenewal?.slice(0, 7) === expected.toISOString().slice(0, 7),
  `${firstRenewal} vs ~${expected.toISOString().slice(0, 10)}`);

// --- idempotency ----------------------------------------------------------
console.log("\n--- idempotency (PayHere retries) ---");

for (let i = 0; i < 5; i++) {
  await notify({ orderRef: row.order_ref, amount: 2500, paymentId: "PH-FIRST" });
}

membership = (await j(await admin(
  `/rest/v1/club_memberships?member_id=eq.${ids[MEMBER]}&club_id=eq.${payClub.id}&select=renewal_date`)))[0];
check("replaying the SAME notification five times does not extend again",
  membership?.renewal_date === firstRenewal,
  `${membership?.renewal_date} vs ${firstRenewal}`);

events = await j(await admin(
  `/rest/v1/payment_events?provider_order_ref=eq.${row.order_ref}&outcome=eq.already_applied&select=id,applied`));
check("the duplicates were logged as already_applied", events.length === 5, `${events.length}`);
check("and marked not applied", events.every((e) => e.applied === false), JSON.stringify(events));

// --- early renewal extends, not restarts ---------------------------------
console.log("\n--- renewing early ---");

const renew = await rpc(tokMember, "start_club_membership_payment", { p_club_id: payClub.id });
const renewRow = Array.isArray(renew.body) ? renew.body[0] : renew.body;
check("renewing is recognised as a renewal", renewRow?.is_renewal === true, JSON.stringify(renewRow));

await notify({ orderRef: renewRow.order_ref, amount: 2500, paymentId: "PH-SECOND" });

membership = (await j(await admin(
  `/rest/v1/club_memberships?member_id=eq.${ids[MEMBER]}&club_id=eq.${payClub.id}&select=renewal_date`)))[0];

const twoTerms = new Date();
twoTerms.setMonth(twoTerms.getMonth() + 24);
check("renewing early ADDS a term to the existing expiry, not from today",
  membership?.renewal_date?.slice(0, 7) === twoTerms.toISOString().slice(0, 7),
  `${membership?.renewal_date}, expected ~${twoTerms.toISOString().slice(0, 10)}`);

// --- failure codes --------------------------------------------------------
console.log("\n--- failure codes ---");

const failStart = await rpc(tokMember, "start_club_membership_payment", { p_club_id: payClub.id });
const failRow = Array.isArray(failStart.body) ? failStart.body[0] : failStart.body;

await notify({ orderRef: failRow.order_ref, amount: 2500, statusCode: -2 });
pay = (await j(await admin(`/rest/v1/payments?provider_order_ref=eq.${failRow.order_ref}&select=status`)))[0];
check("status_code -2 marks the payment failed", pay?.status === "failed", JSON.stringify(pay));

const beforeFail = membership?.renewal_date;
membership = (await j(await admin(
  `/rest/v1/club_memberships?member_id=eq.${ids[MEMBER]}&club_id=eq.${payClub.id}&select=renewal_date`)))[0];
check("a failed payment does not touch the membership",
  membership?.renewal_date === beforeFail, JSON.stringify(membership));

// --- manual reconciliation ------------------------------------------------
console.log("\n--- manual reconciliation ---");

const manualStart = await rpc(tokMember, "start_club_membership_payment", { p_club_id: payClub.id });
const manualRow = Array.isArray(manualStart.body) ? manualStart.body[0] : manualStart.body;
const manualPay = (await j(await admin(
  `/rest/v1/payments?provider_order_ref=eq.${manualRow.order_ref}&select=id`)))[0];

const memberMarks = await rpc(tokMember, "admin_mark_payment_paid",
  { p_payment_id: manualPay.id, p_reason: "let me in" });
check("a member CANNOT mark their own payment paid",
  memberMarks.status >= 400, JSON.stringify(memberMarks));

const noReason = await rpc(tokAdmin, "admin_mark_payment_paid",
  { p_payment_id: manualPay.id, p_reason: "  " });
check("a reason is required", noReason.status >= 400, JSON.stringify(noReason));

const marked = await rpc(tokAdmin, "admin_mark_payment_paid",
  { p_payment_id: manualPay.id, p_reason: "Paid by bank transfer, ref 88213" });
check("an admin can settle it by hand", marked.status < 300, JSON.stringify(marked));

pay = (await j(await admin(`/rest/v1/payments?id=eq.${manualPay.id}&select=status,note`)))[0];
check("it is marked 'manual', not 'success'", pay?.status === "manual", JSON.stringify(pay));
check("the reason was kept", /88213/.test(pay?.note ?? ""), JSON.stringify(pay));

const auditRows = await j(await admin("/rest/v1/admin_audit_log?action=eq.payment.manual&select=id"));
check("manual settlement is audited", auditRows.length > 0, "");

const reMark = await rpc(tokAdmin, "admin_mark_payment_paid",
  { p_payment_id: manualPay.id, p_reason: "again" });
check("an already-settled payment cannot be settled twice",
  reMark.status >= 400, JSON.stringify(reMark));

// A webhook arriving AFTER a manual settlement must not double-apply either.
const afterManual = (await j(await admin(
  `/rest/v1/club_memberships?member_id=eq.${ids[MEMBER]}&club_id=eq.${payClub.id}&select=renewal_date`)))[0];
await notify({ orderRef: manualRow.order_ref, amount: 2500, paymentId: "PH-LATE" });
membership = (await j(await admin(
  `/rest/v1/club_memberships?member_id=eq.${ids[MEMBER]}&club_id=eq.${payClub.id}&select=renewal_date`)))[0];
check("a webhook arriving after a manual settlement is ignored",
  membership?.renewal_date === afterManual?.renewal_date,
  `${membership?.renewal_date} vs ${afterManual?.renewal_date}`);

// --- the record must outlive the people in it ----------------------------
console.log("\n--- deletion safety ---");

// This is why 0015 exists. profiles cascades from auth.users, so an ON DELETE
// RESTRICT from payments made deleting any member who had ever paid fail with
// an opaque FK error -- which would make an account-deletion request
// impossible to honour, and is how the broken cleanup was noticed.
const beforeDelete = await j(await admin(
  `/rest/v1/payments?member_id=eq.${ids[MEMBER]}&select=provider_order_ref,member_email,club_name,amount_lkr`));
check("payments snapshot who paid and what for",
  beforeDelete.length > 0 &&
    beforeDelete.every((p) => p.member_email === MEMBER && Boolean(p.club_name)),
  JSON.stringify(beforeDelete[0]));

const del = await admin(`/auth/v1/admin/users/${ids[MEMBER]}`, { method: "DELETE" });
check("a member who has paid CAN be deleted", del.status < 300, String(del.status));

const survivors = await j(await admin(
  `/rest/v1/payments?provider_order_ref=eq.${beforeDelete[0].provider_order_ref}&select=member_id,member_email,club_name,amount_lkr,status`));
check("their payment record survives the deletion", survivors.length === 1, JSON.stringify(survivors));
check("with the member link nulled out", survivors[0]?.member_id === null, JSON.stringify(survivors[0]));
check("but who paid is still readable", survivors[0]?.member_email === MEMBER, JSON.stringify(survivors[0]));
check("and what they paid for", Boolean(survivors[0]?.club_name), JSON.stringify(survivors[0]));
check("and how much", Number(survivors[0]?.amount_lkr) === 2500, JSON.stringify(survivors[0]));

// Clean the orphaned rows this test just created, or they accumulate.
await admin(`/rest/v1/payments?member_id=is.null&member_email=eq.${MEMBER}`, { method: "DELETE" });


if (!process.env.KEEP) { console.log("\nCleaning up..."); await wipe(); }
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
