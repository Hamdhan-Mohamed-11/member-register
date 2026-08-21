/**
 * Video submission through the real UI, and the URL parser's rejections.
 *
 * The parser is a security control: it is what stops a pasted `javascript:`
 * URL reaching an iframe src. That claim is only worth making if it is tested
 * against the actual form, so this drives the browser rather than the RPC.
 *
 * Requires: dev server on :3001. Cleans up after itself.
 * Run: npm run test:videos:e2e
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { login, relaxTimeouts, settle, visibleText } from "./lib/e2e.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "TestPassw0rd!2026";
const SHOT = "test-screenshots/";
mkdirSync(SHOT, { recursive: true });

if (!URL_ || !SVC) {
  console.error("Missing Supabase env. Run via `npm run test:videos:e2e`.");
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

const MEMBER = "vidmem@vide.test";
const ADMIN = "vidsuper@vide.test";

// Wipes only THIS suite's namespace. Every suite used to share
// @rlstest.local, so each one's cleanup deleted the others' fixtures and the
// whole set only passed when run in isolation.
async function wipe() {
  const { users = [] } = await j(await admin("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@vide.test")) {
      await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
  await admin("/rest/v1/videos?title=like.VE *", { method: "DELETE" });
}

console.log("Preparing...");
await wipe();

const club = (await j(await admin("/rest/v1/clubs?slug=eq.public-club&select=id")))[0];
for (const [email, role, first] of [[MEMBER, "member", "Mila"], [ADMIN, "super_admin", "Rohan"]]) {
  const u = await j(await admin("/auth/v1/admin/users", {
    method: "POST", body: JSON.stringify({ email, password: PW, email_confirm: true }),
  }));
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active", role, first_name: first, last_name: "Vidtest" }),
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
relaxTimeouts(browser);

// --- the parser rejects what it must -------------------------------------
console.log("\n--- URL parsing ---");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await login(page, BASE, MEMBER, PW);

  await page.goto(`${BASE}/videos/submit`, { waitUntil: "domcontentloaded" });
  await settle(page, "/videos/submit");

  // The whole point of parsing server-side rather than storing what was typed.
  const hostile = [
    ["javascript: URL", "javascript:alert(document.cookie)"],
    ["data: URL", "data:text/html,<script>alert(1)</script>"],
    ["a lookalike host", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"],
    ["an unsupported site", "https://tiktok.com/@x/video/123"],
    ["not a URL at all", "just some text"],
  ];

  for (const [label, url] of hostile) {
    await page.fill('input[name="url"]', url);
    await page.fill('input[name="title"]', `VE Hostile ${label}`);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1800);

    const body = await visibleText(page);
    check(`${label} is rejected`,
      /doesn't look like a YouTube or Vimeo link/i.test(body ?? ""), body?.slice(0, 160));
  }

  const stored = await j(await admin("/rest/v1/videos?title=like.VE%20Hostile*&select=id"));
  check("nothing hostile reached the database",
    Array.isArray(stored) && stored.length === 0, JSON.stringify(stored));

  await page.screenshot({ path: `${SHOT}e2e-video-rejected.png`, fullPage: true });

  // --- a real link goes through -------------------------------------------
  console.log("\n--- submission ---");

  await page.fill('input[name="url"]', "https://www.youtube.com/watch?v=BBBBBBBBBBB");
  await page.fill('input[name="title"]', "VE Member video");
  await page.fill('textarea[name="description"]', "Something I thought the club would like.");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  let body = await visibleText(page);
  check("the member is told it is under review",
    /Sent for review/i.test(body ?? ""), body?.slice(0, 200));

  const saved = (await j(await admin("/rest/v1/videos?title=eq.VE%20Member%20video&select=*")))[0];
  check("only the provider and id were stored",
    saved?.provider === "youtube" && saved?.external_id === "BBBBBBBBBBB",
    JSON.stringify(saved));
  check("it is pending", saved?.status === "pending", saved?.status);

  // Their own list shows it; the public feed does not.
  await page.goto(`${BASE}/me/videos`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  body = await visibleText(page);
  check("the submitter sees it on their own page",
    /VE Member video/.test(body ?? ""), "");
  check("marked as awaiting review", /Awaiting review/i.test(body ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-my-videos.png`, fullPage: true });

  await page.goto(`${BASE}/videos`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  body = await visibleText(page);
  check("but NOT in the public feed", !/VE Member video/.test(body ?? ""), "");

  await ctx.close();
}

// --- an admin publishes it ------------------------------------------------
console.log("\n--- moderation ---");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await login(page, BASE, ADMIN, PW);

  await page.goto(`${BASE}/admin/videos`, { waitUntil: "domcontentloaded" });
  await settle(page, "/admin/videos");

  let body = await visibleText(page);
  check("it is in the moderation queue", /VE Member video/.test(body ?? ""), "");
  check("the queue names the submitter", /Mila/.test(body ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-video-queue.png`, fullPage: true });

  await page.click('button:has-text("Publish")');
  await page.waitForTimeout(3000);

  const published = (await j(await admin("/rest/v1/videos?title=eq.VE%20Member%20video&select=status")))[0];
  check("publishing works", published?.status === "approved", JSON.stringify(published));

  await page.goto(`${BASE}/videos`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  body = await visibleText(page);
  check("and it appears in the public feed", /VE Member video/.test(body ?? ""), "");
  await page.screenshot({ path: `${SHOT}e2e-videos-feed.png`, fullPage: true });

  // The iframe must point at the constructed embed URL, not the pasted one.
  const src = await page.getAttribute("iframe", "src");
  check("the iframe src is the constructed embed URL",
    src === "https://www.youtube-nocookie.com/embed/BBBBBBBBBBB", String(src));

  await ctx.close();
}

await browser.close();
if (!process.env.KEEP) { console.log("\nCleaning up..."); await wipe(); }
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
