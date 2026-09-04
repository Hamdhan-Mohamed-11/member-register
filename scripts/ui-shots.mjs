/**
 * Screenshots the member-facing pages at three widths, for eyeballing a visual
 * change. Not a test -- it asserts nothing and fails only if a page errors.
 *
 * Creates its own member in the @shots.test namespace, seeds one notification
 * of each kind so the bell and the list have something to show, and deletes
 * the lot afterwards.
 *
 * Requires: dev server on :3001.
 * Run: node --env-file=.env.local scripts/ui-shots.mjs
 */
import { chromium } from "playwright";
import { login } from "./lib/e2e.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "TestPassw0rd!2026";
const EMAIL = "viewer@shots.test";
const SHOT = "test-screenshots/ui/";
mkdirSync(SHOT, { recursive: true });

if (!URL || !SVC) {
  console.error("Missing Supabase env. Run with --env-file=.env.local.");
  process.exit(2);
}

const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const admin = (path, opts = {}) =>
  fetch(`${URL}${path}`, { ...opts, headers: { ...svcH, ...(opts.headers || {}) } });
const j = async (r) => {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

async function wipe() {
  const { users = [] } = await j(await admin("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@shots.test")) {
      await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
}

console.log("Preparing...");
await wipe();

const created = await j(
  await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: EMAIL,
      password: PW,
      email_confirm: true,
      user_metadata: { first_name: "Nadia", last_name: "Perera" },
    }),
  }),
);
const userId = created.id;
if (!userId) throw new Error(`could not create user: ${JSON.stringify(created)}`);

await admin(`/rest/v1/profiles?id=eq.${userId}`, {
  method: "PATCH",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({
    status: "active",
    first_name: "Nadia",
    last_name: "Perera",
    bio: "Reading my way through the Booker longlist, slowly.",
    learning_tags: ["Sri Lankan fiction", "Poetry"],
    points_balance: 120,
  }),
});

const club = (await j(await admin("/rest/v1/clubs?select=id,name&limit=1")))[0];
if (club) {
  await admin("/rest/v1/club_memberships", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify({
      member_id: userId,
      club_id: club.id,
      status: "active",
      is_primary: true,
      joined_on: new Date().toISOString().slice(0, 10),
      renewal_date: new Date(Date.now() + 300 * 864e5).toISOString().slice(0, 10),
    }),
  });
}

// One of each kind, so the notification list shows every icon and tone.
const now = Date.now();
const seed = [
  ["video.approved", "Your video was approved", "Chapter 4 discussion is now visible to the club.", "/videos", 0.02],
  ["points.awarded", "You earned 15 points", "For September's session on The Seven Moons.", "/me/points", 3],
  ["payment.received", "Payment received", "Colombo Poetry Circle is now active until 4 Sept 2027.", "/me", 26],
  ["join.approved", "You're in — welcome to Colombo Poetry Circle", "Your membership runs until 4 Sept 2027.", "/me", 60],
  ["video.rejected", "Your video was not approved", "The audio is too quiet to follow — please re-record and resubmit.", "/me/videos", 200],
];
const seeded = await admin("/rest/v1/notifications", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify(
    seed.map(([kind, title, body, href, hoursAgo], i) => ({
      member_id: userId,
      kind,
      title,
      body,
      href,
      created_at: new Date(now - hoursAgo * 36e5).toISOString(),
      // The two most recent stay unread, so the bell carries a badge.
      read_at: i < 2 ? null : new Date(now - hoursAgo * 36e5).toISOString(),
    })),
  ),
});

// 0019 may not be pushed yet. The app degrades to an empty bell and an empty
// list rather than erroring, so say so and carry on rather than aborting.
if (!seeded.ok) {
  console.log(
    `  note: could not seed notifications (${seeded.status}) -- has 0019_notifications.sql been pushed?`,
  );
}

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1000 },
  { name: "desktop", width: 1440, height: 1000 },
];

// Signed OUT. These four redirect to /feed for a signed-in member, so they
// have to be shot from a fresh context or they all come back as the feed.
const PUBLIC_PAGES = [
  ["home", "/"],
  ["login", "/login"],
  ["join", "/join"],
  ["forgot-password", "/forgot-password"],
];

const PAGES = [
  ["feed", "/feed"],
  ["notifications", "/notifications"],
  ["me", "/me"],
  ["sessions", "/sessions"],
  ["directory", "/directory"],
  ["videos", "/videos"],
  ["renew", "/renew"],
];

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const errors = [];
  page.on("pageerror", (e) => errors.push(`${vp.name}: ${e.message}`));

  for (const [name, path] of PUBLIC_PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT}${name}-${vp.name}.png`, fullPage: true });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    console.log(
      `  ${vp.name.padEnd(8)} ${path.padEnd(16)} ${
        overflow > 1 ? `OVERFLOW +${overflow}px` : "ok"
      } (signed out)`,
    );
  }

  await login(page, BASE, EMAIL, PW);

  for (const [name, path] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `${SHOT}${name}-${vp.name}.png`,
      fullPage: true,
    });

    // Anything wider than the viewport means a horizontal scrollbar.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    console.log(
      `  ${vp.name.padEnd(8)} ${path.padEnd(16)} ${
        overflow > 1 ? `OVERFLOW +${overflow}px` : "ok"
      }`,
    );
  }

  // The avatar dropdown, which no page screenshot can reach.
  await page.goto(`${BASE}/feed`, { waitUntil: "networkidle" });
  await page.click('button[aria-haspopup="menu"]');
  await page.waitForSelector('[role="menu"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOT}account-menu-${vp.name}.png` });

  if (errors.length) console.log("  page errors:", errors);
  await context.close();
}

await browser.close();

if (!process.env.KEEP_FIXTURES) await wipe();
console.log(`\nScreenshots in ${SHOT}`);
