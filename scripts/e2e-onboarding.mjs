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
// Signup is now two steps: the form creates the account server-side and emails
// a 6-digit code, and a second screen takes that code. This suite stops at the
// code screen -- it has no mailbox, and faking the code would mean reaching
// into GoTrue's token store to verify a path no member takes.
//
// So what is checked here is everything up to the code: the account exists,
// unconfirmed, and the app is asking for the code. Confirmation is then done
// through the admin API further down, exactly as it was when the mailer was
// rate limited. Delivery itself is `npm run test:mail`, which does have an
// inbox to look in.
//
// No SMTP configured means the send throws and no code screen appears. That is
// an ops condition, not a defect, so it SKIPs.
let signupExercised = false;
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  const body = await visibleText(page);
  check("public club appears in the picker", /Public Club/.test(body ?? ""), "");
  check("company clubs do NOT appear in the picker", !/Acme/.test(body ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-join.png`, fullPage: true });

  await page.fill('input[name="first_name"]', "Ada");
  await page.fill('input[name="last_name"]', "Applicant");
  await page.fill('input[name="email"]', APPLICANT);
  await page.fill('input[name="password"]', PW);
  await page.selectOption('select[name="club_id"]', pubClub.id);
  await page.click('button[type="submit"]');

  const codeField = await page
    .waitForSelector('input[name="code"]', { timeout: 15_000 })
    .catch(() => null);

  const created = await j(await admin("/auth/v1/admin/users?per_page=200"));
  const account = (created.users ?? []).find((u) => u.email === APPLICANT);

  if (codeField) {
    signupExercised = true;
    await page.screenshot({ path: `${SHOT}e2e-join-code.png`, fullPage: true });
    check("signup asks for the emailed code", true, "");
    check("the account exists after step one", Boolean(account?.id), "");
    // The point of the whole change: nothing is usable until the code is
    // entered. A confirmed account here would mean the code proved nothing.
    check("the account is NOT yet confirmed",
      Boolean(account) && !account.email_confirmed_at,
      String(account?.email_confirmed_at));
    check("no join request exists before the code is entered",
      (await j(await admin(
        `/rest/v1/club_join_requests?member_id=eq.${account?.id}&select=id`))).length === 0,
      "");
  } else {
    console.log("  SKIP  browser signup -- no code screen.");
    console.log("        Usually means SMTP_* is unset; try `npm run test:mail`.");
  }
  await ctx.close();
}

let applicant = (await j(await admin("/auth/v1/admin/users?per_page=200")))
  .users.find((u) => u.email === APPLICANT);

// Only needed when the signup above could not run at all. Everything
// downstream -- the application, the approval, the membership -- is exercised
// either way.
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
if (!signupExercised) {
  console.log("");
  console.log("NOTE  the browser signup path was NOT exercised this run (no code");
  console.log("      screen -- check SMTP_*). Everything after it was.");
}

if (!process.env.KEEP) { console.log("Cleaning up..."); await wipe(); }
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
