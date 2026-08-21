/**
 * Company onboarding: a super admin creates a company (which auto-creates its
 * private club), bulk-invites employees, and those invites land as pending
 * rows scoped to the right club.
 *
 * The invite EMAILS depend on Supabase's mailer, which is rate limited until
 * custom SMTP is configured -- so this asserts on the invite ROWS, which are
 * what actually control access, and reports separately on whether the sends
 * got through. See DEPLOYMENT.md.
 *
 * Requires: dev server on :3001. Cleans up after itself.
 * Run: npm run test:company
 */
import { chromium } from "playwright";
import { login, relaxTimeouts, settle, visibleText } from "./lib/e2e.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "TestPassw0rd!2026";
const SHOT = "test-screenshots/";
mkdirSync(SHOT, { recursive: true });

if (!URL || !SVC) {
  console.error("Missing Supabase env. Run via `npm run test:company`.");
  process.exit(2);
}

const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const admin = (path, opts = {}) =>
  fetch(`${URL}${path}`, { ...opts, headers: { ...svcH, ...(opts.headers || {}) } });
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

const ADMIN = "coadmin@rlstest.local";
const COMPANY = "Zephyr Testing Ltd";
const EMPLOYEES = ["ada@rlstest.local", "grace@rlstest.local", "alan@rlstest.local"];

async function wipe() {
  const { users = [] } = await j(await admin("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@rlstest.local")) {
      await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
  await admin("/rest/v1/invites?email=like.*%40rlstest.local", { method: "DELETE" });
  const cos = await j(await admin(`/rest/v1/companies?name=eq.${encodeURIComponent(COMPANY)}&select=id`));
  for (const c of Array.isArray(cos) ? cos : []) {
    await admin(`/rest/v1/clubs?company_id=eq.${c.id}`, { method: "DELETE" });
    await admin(`/rest/v1/companies?id=eq.${c.id}`, { method: "DELETE" });
  }
}

console.log("Preparing...");
await wipe();

const pubClub = (await j(await admin("/rest/v1/clubs?slug=eq.public-club&select=id")))[0];
const adminUser = await j(await admin("/auth/v1/admin/users", {
  method: "POST",
  body: JSON.stringify({ email: ADMIN, password: PW, email_confirm: true }),
}));
await admin(`/rest/v1/profiles?id=eq.${adminUser.id}`, {
  method: "PATCH",
  body: JSON.stringify({ role: "super_admin", status: "active", first_name: "Co", last_name: "Admin" }),
});
await admin("/rest/v1/club_memberships", {
  method: "POST",
  body: JSON.stringify({
    member_id: adminUser.id, club_id: pubClub.id, status: "active",
    is_primary: true, joined_on: "2026-01-01", renewal_date: "2027-01-01",
  }),
});

const browser = await chromium.launch();

relaxTimeouts(browser);


const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

await login(page, BASE, ADMIN, PW);

await page.goto(`${BASE}/admin/companies`, { waitUntil: "domcontentloaded" });
await settle(page, "/admin/companies");
check("super admin reaches /admin/companies", page.url().endsWith("/admin/companies"), page.url());

// --- create the company --------------------------------------------------
await page.fill('input[name="name"]', COMPANY);
await page.fill('input[name="contactEmail"]', "hr@zephyr.lk");
await page.fill('input[name="feeLkr"]', "4500");
await page.fill('input[name="termMonths"]', "12");
await page.click('button:has-text("Add company")');
await page.waitForTimeout(3500);

const created = await j(await admin(
  `/rest/v1/companies?name=eq.${encodeURIComponent(COMPANY)}&select=id,name,contact_email`));
check("the company was created", Array.isArray(created) && created.length === 1, JSON.stringify(created));

const companyId = created?.[0]?.id;
const coClub = (await j(await admin(`/rest/v1/clubs?company_id=eq.${companyId}&select=*`)))[0];
check("a private club was created alongside it", Boolean(coClub), JSON.stringify(coClub));
check("the club is a company club", coClub?.kind === "company", coClub?.kind);
check("the per-club fee override was stored",
  Number(coClub?.membership_fee_lkr) === 4500, String(coClub?.membership_fee_lkr));
check("the per-club term override was stored",
  coClub?.term_months === 12, String(coClub?.term_months));
check("the club got a slug", Boolean(coClub?.slug), String(coClub?.slug));

const body = await visibleText(page);
check("the new company is listed", new RegExp(COMPANY).test(body ?? ""), "");
await page.screenshot({ path: `${SHOT}e2e-companies.png`, fullPage: true });

// --- bulk invite employees ----------------------------------------------
// Deliberately messy input: mixed separators, a display-name form, a
// duplicate, and stray whitespace.
const pasted = `  ${EMPLOYEES[0]}
Grace Hopper <${EMPLOYEES[1]}>, ${EMPLOYEES[2]}
${EMPLOYEES[0]}  `;

await page.fill('textarea[name="emails"]', pasted);
await page.click('button:has-text("Send invites")');
await page.waitForTimeout(6000);

const invites = await j(await admin(
  `/rest/v1/invites?club_id=eq.${coClub.id}&select=email,status,role,company_id`));
const inviteEmails = (Array.isArray(invites) ? invites : []).map((i) => i.email).sort();

check("three invite rows were created (duplicate collapsed)",
  inviteEmails.length === 3, JSON.stringify(inviteEmails));
check("the display-name form was parsed",
  inviteEmails.includes(EMPLOYEES[1]), JSON.stringify(inviteEmails));
check("invites are scoped to the company",
  (invites ?? []).every((i) => i.company_id === companyId), JSON.stringify(invites));
check("invites are for plain members, not admins",
  (invites ?? []).every((i) => i.role === "member"), JSON.stringify(invites));
check("invites are pending",
  (invites ?? []).every((i) => i.status === "pending"), JSON.stringify(invites));

const afterInvite = await visibleText(page);
const sentOk = /Invited \d+ (person|people)/.test(afterInvite ?? "");
const someFailed = /didn't go through/.test(afterInvite ?? "");
check("the result is reported either way", sentOk || someFailed, afterInvite?.slice(0, 300));
if (someFailed && !sentOk) {
  console.log("  NOTE  invite emails did not send -- expected until custom SMTP");
  console.log("        is configured. The invite ROWS are what gate access, and");
  console.log("        those were created correctly. See DEPLOYMENT.md.");
}
await page.screenshot({ path: `${SHOT}e2e-invites.png`, fullPage: true });

// --- the company club must not leak into the public join picker ----------
await ctx.close();
{
  const anonCtx = await browser.newContext();
  const anonPage = await anonCtx.newPage();
  await anonPage.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  const joinBody = await visibleText(anonPage);
  check("the new company club is NOT offered on /join",
    !new RegExp(COMPANY).test(joinBody ?? ""), joinBody?.slice(0, 200));
  await anonCtx.close();
}

await browser.close();
if (!process.env.KEEP) { console.log("Cleaning up..."); await wipe(); }
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
