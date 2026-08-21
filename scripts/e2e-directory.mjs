/**
 * The Phase 3 acceptance test: the member directory enforces the shared-club
 * visibility rule, in the UI and at the API.
 *
 * scripts/rls-test.mjs already proves the POLICY withholds rows. This proves
 * the app actually asks the question -- a page that queries with the service
 * role, or forgets to gate a route, would sail through the RLS suite and leak
 * here.
 *
 * Requires: dev server on :3001, and `KEEP=1 npm run test:rls` fixtures.
 * Run: npm run test:directory
 */
import { chromium } from "playwright";
import { login, relaxTimeouts, visibleText } from "./lib/e2e.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "TestPassw0rd!2026";
const SHOT = "test-screenshots/";
mkdirSync(SHOT, { recursive: true });

if (!URL || !SVC) {
  console.error("Missing Supabase env. Run via `npm run test:directory`.");
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

const users = await j(await admin("/auth/v1/admin/users?per_page=200"));
const byEmail = Object.fromEntries((users.users ?? []).map((u) => [u.email, u.id]));

const need = ["puba@rlstest.local", "pubb@rlstest.local", "coc@rlstest.local", "coboth@rlstest.local"];
for (const e of need) {
  if (!byEmail[e]) {
    console.error(`Missing fixture ${e}. Run: KEEP=1 npm run test:rls`);
    process.exit(2);
  }
}

// Setup must be IDEMPOTENT: a previous run that crashed part-way leaves its
// reading items behind, and the counts this suite asserts on ("Currently
// reading (1)") then fail for reasons that have nothing to do with the app.
for (const e of need) {
  await admin(`/rest/v1/reading_items?member_id=eq.${byEmail[e]}`, { method: "DELETE" });
}

// Give the public members something to show, so "currently reading" on the
// directory card is exercised rather than always empty.
await admin("/rest/v1/reading_items", {
  method: "POST",
  body: JSON.stringify([
    { member_id: byEmail["pubb@rlstest.local"], title: "Klara and the Sun", author: "Kazuo Ishiguro", status: "reading" },
    { member_id: byEmail["coc@rlstest.local"], title: "A Secret Company Book", author: "Nobody", status: "reading" },
  ]),
});

const browser = await chromium.launch();

relaxTimeouts(browser);

async function openAs(ctx, email) {
  const page = await ctx.newPage();
  await login(page, BASE, email, PW);
  return page;
}

// --- public member's view ------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await openAs(ctx, "puba@rlstest.local");

  await page.goto(`${BASE}/directory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const body = await visibleText(page);

  check("public member sees a fellow public member", /Pub Bee/.test(body ?? ""), "");
  check("public member does NOT see a company-only member", !/Co Cee/.test(body ?? ""), "");
  check("public member DOES see the dual-club member", /Co Both/.test(body ?? ""), "");
  check("directory shows what someone is reading",
    /Klara and the Sun/.test(body ?? ""), "");
  check("company member's book does NOT leak",
    !/A Secret Company Book/.test(body ?? ""), "");
  check("the viewer is not listed among the others",
    !/Pub Aye/.test(body ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-directory.png`, fullPage: true });

  // Direct URL access must be gated too, not just the listing.
  const res = await page.goto(`${BASE}/members/${byEmail["coc@rlstest.local"]}`, {
    waitUntil: "domcontentloaded",
  });
  check("direct-linking an invisible member 404s", res?.status() === 404, String(res?.status()));

  const okRes = await page.goto(`${BASE}/members/${byEmail["pubb@rlstest.local"]}`, {
    waitUntil: "domcontentloaded",
  });
  check("a visible member's profile loads", okRes?.status() === 200, String(okRes?.status()));
  const profileBody = await visibleText(page);
  check("their profile shows their club", /Public Club/.test(profileBody ?? ""), "");
  check("their profile shows what they're reading",
    /Klara and the Sun/.test(profileBody ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-member-profile.png`, fullPage: true });

  await page.goto(`${BASE}/members/${byEmail["puba@rlstest.local"]}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1200);
  check("visiting your own profile redirects to /me",
    page.url().includes("/me"), page.url());

  await ctx.close();
}

// --- company member's view -----------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await openAs(ctx, "coc@rlstest.local");

  await page.goto(`${BASE}/directory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const body = await visibleText(page);

  check("company member sees their colleague", /Co Both/.test(body ?? ""), "");
  check("company member does NOT see public members", !/Pub Aye|Pub Bee/.test(body ?? ""), "");

  const res = await page.goto(`${BASE}/members/${byEmail["puba@rlstest.local"]}`, {
    waitUntil: "domcontentloaded",
  });
  check("company member direct-linking a public member 404s",
    res?.status() === 404, String(res?.status()));
  await ctx.close();
}

// --- own reading list ----------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await openAs(ctx, "puba@rlstest.local");

  await page.goto(`${BASE}/me/reading`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  await page.fill('input[name="title"]', "The Remains of the Day");
  await page.fill('input[name="author"]', "Kazuo Ishiguro");
  await page.click('button:has-text("Add book")');
  await page.waitForTimeout(2500);

  let body = await visibleText(page);
  check("a book can be added", /The Remains of the Day/.test(body ?? ""), "");
  check("it lands under currently reading",
    /Currently reading \(1\)/.test(body ?? ""), body?.match(/Currently reading \(\d\)/)?.[0] ?? "");

  await page.click('button:has-text("Mark read")');
  await page.waitForTimeout(2500);
  body = await visibleText(page);
  check("marking it read moves it to the history",
    /Read \(1\)/.test(body ?? ""), body?.match(/Read \(\d\)/)?.[0] ?? "");
  check("currently reading is emptied",
    /Currently reading \(0\)/.test(body ?? ""), body?.match(/Currently reading \(\d\)/)?.[0] ?? "");

  const rows = await j(await admin(
    `/rest/v1/reading_items?member_id=eq.${byEmail["puba@rlstest.local"]}&status=eq.read&select=title,date_read`));
  check("marking read sets date_read",
    Array.isArray(rows) && rows[0]?.date_read, JSON.stringify(rows));

  await page.screenshot({ path: `${SHOT}e2e-reading.png`, fullPage: true });
  await ctx.close();
}

// --- avatar route --------------------------------------------------------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/api/avatars/${byEmail["pubb@rlstest.local"]}`, {
    waitUntil: "domcontentloaded",
  });
  // Two acceptable outcomes, both denials: the proxy bounces the request to
  // /login before the route runs, or the route itself answers 401. Which one
  // happens depends on the proxy matcher, so assert the OUTCOME (no image)
  // rather than the mechanism.
  const deniedByProxy = page.url().includes("/login");
  check("the avatar route refuses anonymous callers",
    res?.status() === 401 || deniedByProxy,
    `status ${res?.status()} url ${page.url()}`);

  // And prove it directly: a bare fetch with no cookies must not come back as
  // an image.
  const raw = await fetch(`${BASE}/api/avatars/${byEmail["pubb@rlstest.local"]}`, {
    redirect: "manual",
  });
  const location = raw.headers.get("location") ?? "";
  check("anonymous fetch is never redirected to storage",
    !location.includes("/storage/"), `${raw.status} -> ${location}`);
  await ctx.close();
}

await browser.close();

// Tidy the reading rows so re-runs start clean.
for (const e of need) {
  await admin(`/rest/v1/reading_items?member_id=eq.${byEmail[e]}`, { method: "DELETE" });
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
