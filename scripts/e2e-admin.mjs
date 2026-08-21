/**
 * Admin settings and member management, through the real UI.
 *
 * The bit that matters most: the last super admin cannot be demoted. Getting
 * that wrong locks the club out of its own admin area with one dropdown
 * change and no way back short of SQL.
 *
 * Requires: dev server on :3001. Cleans up after itself.
 * Run: npm run test:admin
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "TestPassw0rd!2026";
const SHOT = "test-screenshots/";
mkdirSync(SHOT, { recursive: true });

if (!URL || !SVC) {
  console.error("Missing Supabase env. Run via `npm run test:admin`.");
  process.exit(2);
}

const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const admin = (p, o = {}) => fetch(`${URL}${p}`, { ...o, headers: { ...svcH, ...(o.headers || {}) } });
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

const A1 = "adm1@rlstest.local";
const A2 = "adm2@rlstest.local";
const M1 = "mem1@rlstest.local";

async function wipe() {
  const { users = [] } = await j(await admin("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@rlstest.local")) {
      await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
  await admin("/rest/v1/clubs?slug=eq.adm-second-club", { method: "DELETE" });
}

// Restore settings afterwards so a test run does not leave the club's real
// fee at whatever this script poked it to.
const original = (await j(await admin("/rest/v1/app_settings?id=eq.1&select=*")))[0];

console.log("Preparing...");
await wipe();

const club = (await j(await admin("/rest/v1/clubs?slug=eq.public-club&select=id,name")))[0];
const club2 = (await j(await admin("/rest/v1/clubs", {
  method: "POST", headers: { Prefer: "return=representation" },
  body: JSON.stringify({ name: "ADM Second Club", slug: "adm-second-club", kind: "public" }),
})))[0];

const ids = {};
for (const [email, first, role] of [[A1, "Alpha", "super_admin"], [A2, "Beta", "member"], [M1, "Gamma", "member"]]) {
  const u = await j(await admin("/auth/v1/admin/users", {
    method: "POST", body: JSON.stringify({ email, password: PW, email_confirm: true }),
  }));
  ids[email] = u.id;
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active", role, first_name: first, last_name: "Admtest" }),
  });
  await admin("/rest/v1/club_memberships", {
    method: "POST",
    body: JSON.stringify({
      member_id: u.id, club_id: club.id, status: "active",
      is_primary: true, joined_on: "2026-01-01", renewal_date: "2027-01-01",
    }),
  });
}

const browser = await chromium.launch();
const visibleText = (page) => page.innerText("body");
async function settle(page, expected, timeout = 25000) {
  try { await page.waitForURL((u) => u.pathname === expected, { timeout }); } catch {}
  return page.url();
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', A1);
await page.fill('input[name="password"]', PW);
await page.click('button[type="submit"]');
await settle(page, "/feed");

// --- settings ------------------------------------------------------------
console.log("\n--- settings ---");

await page.goto(`${BASE}/admin/settings`, { waitUntil: "domcontentloaded" });
await settle(page, "/admin/settings");
check("super admin reaches settings", page.url().endsWith("/admin/settings"), page.url());

await page.fill('input[name="membershipFee"]', "4750");
await page.fill('input[name="bookDiscount"]', "25");
await page.fill('input[name="termMonths"]', "12");
await page.click('button:has-text("Save settings")');
await page.waitForTimeout(3000);

const saved = (await j(await admin("/rest/v1/app_settings?id=eq.1&select=*")))[0];
check("the membership fee was saved", Number(saved.membership_fee_lkr) === 4750, String(saved.membership_fee_lkr));
check("the book discount was saved", Number(saved.book_discount_percent) === 25, String(saved.book_discount_percent));
check("the change was audited",
  (await j(await admin("/rest/v1/admin_audit_log?action=eq.settings.update&select=id"))).length > 0, "");

// Points rules save on blur.
const pointsInput = await page.$('#points-attend');
if (pointsInput) {
  await pointsInput.fill("12");
  await page.click("h1");
  await page.waitForTimeout(2500);
}
const rule = (await j(await admin("/rest/v1/points_rules?code=eq.attend&select=points")))[0];
check("a points rule can be re-tuned", rule?.points === 12, JSON.stringify(rule));
await page.screenshot({ path: `${SHOT}e2e-settings.png`, fullPage: true });

// Re-tuning must NOT rewrite history.
await admin("/rest/v1/points_rules?code=eq.attend", {
  method: "PATCH", body: JSON.stringify({ points: 10 }),
});

// --- members -------------------------------------------------------------
console.log("\n--- members ---");

await page.goto(`${BASE}/admin/members`, { waitUntil: "domcontentloaded" });
await settle(page, "/admin/members");
let body = await visibleText(page);
check("the member list loads", /Gamma Admtest/.test(body ?? ""), "");
check("the list shows club counts", /1 club/.test(body ?? ""), "");

await page.goto(`${BASE}/admin/members?q=Gamma`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
body = await visibleText(page);
check("search narrows the list",
  /Gamma Admtest/.test(body ?? "") && !/Beta Admtest/.test(body ?? ""), "");

// --- promote + the last-super-admin guard --------------------------------
await page.goto(`${BASE}/admin/members/${ids[A2]}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.selectOption("#role", "secretary");
await page.waitForTimeout(3000);

let profile = (await j(await admin(`/rest/v1/profiles?id=eq.${ids[A2]}&select=role`)))[0];
check("a member can be promoted to secretary", profile?.role === "secretary", JSON.stringify(profile));
await page.screenshot({ path: `${SHOT}e2e-member-admin.png`, fullPage: true });

// Alpha is currently the ONLY super admin.
await page.goto(`${BASE}/admin/members/${ids[A1]}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.selectOption("#role", "member");
await page.waitForTimeout(3000);

profile = (await j(await admin(`/rest/v1/profiles?id=eq.${ids[A1]}&select=role`)))[0];
check("the LAST super admin cannot demote themselves",
  profile?.role === "super_admin", JSON.stringify(profile));
body = await visibleText(page);
check("and they are told why", /last super admin/i.test(body ?? ""), body?.slice(0, 200));

// With a second super admin, demotion is allowed.
await admin(`/rest/v1/profiles?id=eq.${ids[A2]}`, {
  method: "PATCH", body: JSON.stringify({ role: "super_admin" }),
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.selectOption("#role", "member");
await page.waitForTimeout(3000);
profile = (await j(await admin(`/rest/v1/profiles?id=eq.${ids[A1]}&select=role`)))[0];
check("with a second super admin, demotion is allowed",
  profile?.role === "member", JSON.stringify(profile));

// --- club membership admin -----------------------------------------------
console.log("\n--- club memberships ---");

// Alpha just demoted themselves, so continue as Beta.
await ctx.close();
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page2 = await ctx2.newPage();
await page2.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page2.fill('input[name="email"]', A2);
await page2.fill('input[name="password"]', PW);
await page2.click('button[type="submit"]');
await settle(page2, "/feed");

await page2.goto(`${BASE}/admin/members/${ids[M1]}`, { waitUntil: "domcontentloaded" });
await page2.waitForTimeout(1500);
await page2.selectOption("select:below(:text('Club'))", club2.id).catch(() => {});
await page2.click('button:has-text("Add club")');
await page2.waitForTimeout(3000);

const memberships = await j(await admin(
  `/rest/v1/club_memberships?member_id=eq.${ids[M1]}&select=club_id,status,is_primary,renewal_date`));
check("a second club can be granted", memberships.length === 2, JSON.stringify(memberships));
check("the second club is not primary",
  memberships.filter((m) => m.is_primary).length === 1, JSON.stringify(memberships));
check("the second club has its own renewal date",
  memberships.every((m) => Boolean(m.renewal_date)), JSON.stringify(memberships));

const audit = await j(await admin("/rest/v1/admin_audit_log?action=eq.membership.add&select=id"));
check("granting a club is audited", Array.isArray(audit) && audit.length > 0, "");

await browser.close();

// Restore the club's real settings.
await admin("/rest/v1/app_settings?id=eq.1", {
  method: "PATCH",
  body: JSON.stringify({
    membership_fee_lkr: original.membership_fee_lkr,
    membership_term_months: original.membership_term_months,
    renewal_grace_days: original.renewal_grace_days,
    expiring_soon_days: original.expiring_soon_days,
    book_discount_percent: original.book_discount_percent,
  }),
});

if (!process.env.KEEP) { console.log("\nCleaning up..."); await wipe(); }
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
