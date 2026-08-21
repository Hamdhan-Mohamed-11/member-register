/**
 * End-to-end onboarding: a stranger applies to a public club, an admin
 * approves, and the applicant becomes an active member who can see the club.
 *
 * This is the flow the club will actually use every week, and it crosses more
 * layers than anything else in the app -- signUp, the handle_new_user trigger,
 * the request_club_join RPC, an admin server action, and the shared-club
 * visibility rule all have to line up.
 *
 * Requires: dev server on :3001. Cleans up after itself.
 * Run: npm run test:onboarding
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
  console.error("Missing Supabase env. Run via `npm run test:onboarding`.");
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

const APPLICANT = "applicant@onb.test";
const ADMIN = "onboardadmin@onb.test";

// Wipes only THIS suite's namespace. Every suite used to share
// @rlstest.local, so each one's cleanup deleted the others' fixtures and the
// whole set only passed when run in isolation.
async function wipe() {
  const { users = [] } = await j(await admin("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@onb.test")) {
      await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
}

console.log("Preparing...");
await wipe();

const pubClub = (await j(await admin("/rest/v1/clubs?slug=eq.public-club&select=id,name")))[0];
if (!pubClub) throw new Error("seeded public club missing");

// An admin to do the approving.
const adminUser = await j(await admin("/auth/v1/admin/users", {
  method: "POST",
  body: JSON.stringify({ email: ADMIN, password: PW, email_confirm: true }),
}));
await admin(`/rest/v1/profiles?id=eq.${adminUser.id}`, {
  method: "PATCH",
  body: JSON.stringify({ role: "super_admin", status: "active", first_name: "On", last_name: "Board" }),
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




// --- 1. applicant signs up via /join ------------------------------------
//
// Supabase's BUILT-IN auth mailer is rate limited to a couple of sends an
// hour, and every signup here consumes one. Once custom SMTP is configured
// this branch runs for real; until then the test detects the limit, says so
// loudly, and creates the applicant out of band so the rest of the flow is
// still covered rather than the whole suite going red for an ops reason.
let emailLimited = false;
{
  const probe = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `probe-${Date.now()}@onb.test`, password: PW }),
  });
  const body = await j(probe);
  emailLimited = body?.error_code === "over_email_send_rate_limit";
}

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  const body = await visibleText(page);
  check("public club appears in the picker", /Public Club/.test(body ?? ""), "");
  check("company clubs do NOT appear in the picker", !/Acme/.test(body ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-join.png`, fullPage: true });

  if (emailLimited) {
    console.log("  SKIP  browser signup -- Supabase auth email rate limit hit.");
    console.log("        Configure custom SMTP to exercise this path for real.");
  } else {
    await page.fill('input[name="first_name"]', "Ada");
    await page.fill('input[name="last_name"]', "Applicant");
    await page.fill('input[name="email"]', APPLICANT);
    await page.fill('input[name="password"]', PW);
    await page.selectOption('select[name="club_id"]', pubClub.id);
    await page.click('button[type="submit"]');
    await settle(page, "/pending");

    const after = await visibleText(page);
    check("signup either lands on /pending or asks for email confirmation",
      page.url().includes("/pending") || /confirm your address/i.test(after ?? ""),
      page.url());
  }
  await ctx.close();
}

let applicant = (await j(await admin("/auth/v1/admin/users?per_page=200")))
  .users.find((u) => u.email === APPLICANT);

if (!applicant) {
  const created = await j(await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: APPLICANT, password: PW, email_confirm: true }),
  }));
  await admin(`/rest/v1/profiles?id=eq.${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({ first_name: "Ada", last_name: "Applicant" }),
  });
  applicant = created;
}

check("an applicant account exists", Boolean(applicant?.id), JSON.stringify(applicant));

if (applicant && !applicant.email_confirmed_at) {
  await admin(`/auth/v1/admin/users/${applicant.id}`, {
    method: "PUT", body: JSON.stringify({ email_confirm: true }),
  });
}

const profile = (await j(await admin(
  `/rest/v1/profiles?id=eq.${applicant.id}&select=status,role,email`)))[0];
check("applicant profile is pending", profile?.status === "pending", JSON.stringify(profile));
check("applicant profile is a plain member", profile?.role === "member", JSON.stringify(profile));

// --- 2. applicant applies (or already did) ------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page, BASE, APPLICANT, PW, "/pending");
  check("applicant is held on /pending", page.url().includes("/pending"), page.url());

  // If the confirmation path meant the application never went in, /pending
  // offers the picker -- use it.
  const picker = await page.$('select[name="club_id"]');
  if (picker) {
    await page.selectOption('select[name="club_id"]', pubClub.id);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
  }

  const reqs = await j(await admin(
    `/rest/v1/club_join_requests?member_id=eq.${applicant.id}&select=*`));
  check("a pending join request exists",
    Array.isArray(reqs) && reqs.length === 1 && reqs[0].status === "pending",
    JSON.stringify(reqs));
  await page.screenshot({ path: `${SHOT}e2e-pending-applied.png`, fullPage: true });
  await ctx.close();
}

// --- 3. admin approves ---------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, BASE, ADMIN, PW);

  await page.goto(`${BASE}/admin/join-requests`, { waitUntil: "domcontentloaded" });
  await settle(page, "/admin/join-requests");
  const body = await visibleText(page);
  check("the application is listed for the admin",
    /Ada Applicant/.test(body ?? ""), "");
  check("the listing names the club", /Public Club/.test(body ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-join-requests.png`, fullPage: true });

  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(3000);

  const after = await visibleText(page);
  check("the approved application leaves the queue",
    !/Ada Applicant/.test(after ?? ""), "");
  await ctx.close();
}

// --- 4. the applicant is now a member -----------------------------------
{
  const p = (await j(await admin(
    `/rest/v1/profiles?id=eq.${applicant.id}&select=status`)))[0];
  check("approval activated the account", p?.status === "active", JSON.stringify(p));

  const m = (await j(await admin(
    `/rest/v1/club_memberships?member_id=eq.${applicant.id}&select=*`)))[0];
  check("approval created an active membership", m?.status === "active", JSON.stringify(m));
  check("the first club is primary", m?.is_primary === true, JSON.stringify(m));
  check("a renewal date was set", Boolean(m?.renewal_date), JSON.stringify(m));

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page, BASE, APPLICANT, PW);
  check("the new member now reaches /feed", page.url().includes("/feed"), page.url());

  const body = await visibleText(page);
  check("their feed shows the club they joined", /Public Club/.test(body ?? ""), "");
  check("their feed greets them by name", /Hello, Ada/.test(body ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-new-member.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
if (!process.env.KEEP) { console.log("Cleaning up..."); await wipe(); }
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
