/**
 * End-to-end auth gating: who lands where, and who gets bounced.
 *
 * Complements scripts/rls-test.mjs -- that one proves the DATABASE refuses to
 * hand over rows; this one proves the APP routes people correctly. Both are
 * needed: a correct redirect over a leaky policy is still a leak, and a tight
 * policy behind a broken redirect is still a broken app.
 *
 * Requires: dev server on :3001, and fixtures from `KEEP=1 npm run test:rls`.
 * Run:      npm run test:e2e
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const PW = "TestPassw0rd!2026";
const SHOT = "test-screenshots/";
mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

const browser = await chromium.launch();

/**
 * Navigation here is a REDIRECT CHAIN, not a single hop: the login form always
 * aims at /feed, and the server then bounces anyone who isn't active on to
 * /pending.
 *
 * So wait for the EXPECTED destination rather than for the URL to "stop
 * moving". Stability-polling is flaky against a dev server, which compiles each
 * route lazily on first visit -- an unlucky 700ms compile of /pending looks
 * exactly like "we've arrived at /feed".
 */
async function settle(page, expected, timeout = 25000) {
  try {
    await page.waitForURL((u) => u.pathname === expected, { timeout });
  } catch {
    // Swallow: the check() that follows reports the actual URL, which is a far
    // more useful failure message than a Playwright timeout stack.
  }
  return page.url();
}

async function login(page, email, expected = "/feed") {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await page.click('button[type="submit"]');
  await settle(page, expected);
}

// --- 1. anon gating ------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/feed`, { waitUntil: "domcontentloaded" });
  check("anon hitting /feed is bounced to /login",
    page.url().includes("/login"), page.url());
  check("bounce preserves ?next", page.url().includes("next=%2Ffeed"), page.url());

  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  check("anon hitting /admin is bounced to /login", page.url().includes("/login"), page.url());

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check("anon CAN see the landing page", page.url().endsWith("/"), page.url());
  await ctx.close();
}

// --- 2. plain member -----------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page, "puba@rlstest.local");
  check("member lands on /feed after login", page.url().includes("/feed"), page.url());

  const body = await page.textContent("body");
  check("feed greets the member by name", /Hello, Pub/.test(body ?? ""), "");
  check("feed shows the club name", /Public Club/.test(body ?? ""), "");
  check("member does NOT see the admin card", !/Club admin/.test(body ?? ""), "");

  await page.screenshot({ path: `${SHOT}e2e-member-feed.png`, fullPage: true });

  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await settle(page, "/feed");
  check("member hitting /admin is bounced to /feed",
    page.url().includes("/feed"), page.url());

  // Signed-in user should not be able to sit on /login
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await settle(page, "/feed");
  check("signed-in member is redirected away from /login",
    page.url().includes("/feed"), page.url());
  await ctx.close();
}

// --- 3. super admin ------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "admin@rlstest.local");
  check("admin lands on /feed after login", page.url().includes("/feed"), page.url());

  const feedBody = await page.textContent("body");
  check("admin DOES see the admin card", /Club admin/.test(feedBody ?? ""), "");

  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await settle(page, "/admin");
  check("admin reaches /admin", page.url().endsWith("/admin"), page.url());

  const adminBody = await page.textContent("body");
  check("admin sees super-admin-only areas", /Companies/.test(adminBody ?? ""), "");
  check("admin sees secretary areas", /Sessions/.test(adminBody ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-admin.png`, fullPage: true });
  await ctx.close();
}

// --- 4. pending applicant ------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page, "pending@rlstest.local", "/pending");
  check("pending applicant is sent to /pending", page.url().includes("/pending"), page.url());

  const body = await page.textContent("body");
  check("pending page explains the wait",
    /application is with the club/i.test(body ?? ""), "");

  await page.goto(`${BASE}/feed`, { waitUntil: "domcontentloaded" });
  await settle(page, "/pending");
  check("pending applicant CANNOT reach /feed", page.url().includes("/pending"), page.url());
  await page.screenshot({ path: `${SHOT}e2e-pending.png`, fullPage: true });
  await ctx.close();
}

// --- 5. sign out ---------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page, "puba@rlstest.local");
  await page.goto(`${BASE}/pending`, { waitUntil: "domcontentloaded" });
  // active member gets redirected off /pending, so sign out from feed instead
  await page.goto(`${BASE}/feed`, { waitUntil: "domcontentloaded" });

  await ctx.request.post(`${BASE}/auth/signout`);
  await page.goto(`${BASE}/feed`, { waitUntil: "domcontentloaded" });
  check("after sign-out /feed bounces to /login", page.url().includes("/login"), page.url());
  await ctx.close();
}

await browser.close();
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
