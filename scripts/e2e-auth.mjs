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
import { login, relaxTimeouts, settle, visibleText } from "./lib/e2e.mjs";
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

relaxTimeouts(browser);





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
  await login(page, BASE, "puba@rlstest.local", PW);
  check("member lands on /feed after login", page.url().includes("/feed"), page.url());

  const body = await visibleText(page);
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

// --- 2b. multi-club member -----------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page, BASE, "coboth@rlstest.local", PW);
  const body = await visibleText(page);
  // Belongs to the company club AND has paid to join the public club, so the
  // header must list both rather than silently showing only the primary one.
  check("multi-club member sees their company club",
    /Acme Club/.test(body ?? ""), "");
  check("multi-club member sees their public club",
    /Public Club/.test(body ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-multiclub.png`, fullPage: true });
  await ctx.close();
}

// --- 3. super admin ------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, BASE, "admin@rlstest.local", PW);
  check("admin lands on /feed after login", page.url().includes("/feed"), page.url());

  const feedBody = await visibleText(page);
  check("admin DOES see the admin card", /Club admin/.test(feedBody ?? ""), "");

  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await settle(page, "/admin");
  check("admin reaches /admin", page.url().endsWith("/admin"), page.url());

  const adminBody = await visibleText(page);
  check("admin sees super-admin-only areas", /Companies/.test(adminBody ?? ""), "");
  check("admin sees secretary areas", /Sessions/.test(adminBody ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-admin.png`, fullPage: true });
  await ctx.close();
}

// --- 4. pending applicant ------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page, BASE, "pending@rlstest.local", PW, "/pending");
  check("pending applicant is sent to /pending", page.url().includes("/pending"), page.url());

  const body = await visibleText(page);
  // /pending has two faces: an applicant who has already applied is told to
  // wait, and one who has not (the email-confirmation path) is offered the
  // club picker. Either is correct -- what matters is that they are told
  // something actionable rather than being dumped on a blank page.
  check("pending page explains what happens next",
    /application is with the club/i.test(body ?? "") ||
    /choose a club/i.test(body ?? ""), body?.slice(0, 200));

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
  await login(page, BASE, "puba@rlstest.local", PW);
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
