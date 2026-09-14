/**
 * Horizontal-overflow audit.
 *
 * Loads every page at 360px -- the narrowest phone worth supporting -- and
 * reports any element wider than the viewport, naming the element rather than
 * just the page so the cause is obvious. A page that scrolls sideways is the
 * single most common mobile bug and the one screenshots rarely reveal, because
 * the offending element is usually off screen.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "https://member.pickabook.lk";
const WIDTH = 360;

const MEMBER = { email: "member@test.pickabook.lk", password: "PickABook!2026" };
const ADMIN = { email: process.env.AUDIT_ADMIN_EMAIL, password: process.env.AUDIT_ADMIN_PASSWORD };

const MEMBER_PAGES = [
  "/", "/login", "/join", "/forgot-password",
  "/feed", "/sessions", "/books", "/library", "/directory", "/leaderboard",
  "/discover", "/discover/saved", "/cart", "/orders", "/notifications",
  "/me", "/me/edit", "/me/points", "/me/reading", "/me/videos",
  "/me/badges", "/me/wishlist", "/me/borrowing",
  "/videos", "/videos/submit", "/renew",
];

const ADMIN_PAGES = [
  "/admin", "/admin/clubs", "/admin/companies", "/admin/join-requests",
  "/admin/members", "/admin/sessions", "/admin/sessions/new",
  "/admin/videos", "/admin/discover", "/admin/orders", "/admin/library",
  "/admin/payments", "/admin/settings",
];

async function login(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', who.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

/** Elements that stick out past the viewport, with enough detail to find them. */
async function offenders(page) {
  return page.evaluate((width) => {
    const bad = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // 1px of slack: sub-pixel rounding on borders is not a bug.
      if (r.right > width + 1 || r.left < -1) {
        const cls = (el.className || "").toString().slice(0, 70);
        bad.push({
          tag: el.tagName.toLowerCase(),
          cls,
          right: Math.round(r.right),
          text: (el.textContent || "").trim().slice(0, 40),
        });
      }
    }
    // Only the outermost offender per subtree matters -- a child sticking out
    // usually means its parent does too, and listing both is noise.
    return bad.slice(0, 4);
  }, WIDTH);
}

const browser = await chromium.launch();
let pagesChecked = 0;
let pagesBroken = 0;

async function sweep(label, paths, who) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 780 } });
  const page = await ctx.newPage();
  if (who) await login(page, who);

  console.log(`\n--- ${label} ---`);
  for (const path of paths) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    pagesChecked++;

    if (scrollWidth > WIDTH + 1) {
      pagesBroken++;
      console.log(`  OVERFLOW ${path}  (scrollWidth ${scrollWidth})`);
      for (const o of await offenders(page)) {
        console.log(`           <${o.tag} class="${o.cls}"> right=${o.right} "${o.text}"`);
      }
    } else {
      console.log(`  ok       ${path}`);
    }
  }
  await ctx.close();
}

await sweep("signed out + member", MEMBER_PAGES, MEMBER);
if (ADMIN.email && ADMIN.password) {
  await sweep("admin", ADMIN_PAGES, ADMIN);
} else {
  console.log("\n--- admin --- skipped (no AUDIT_ADMIN_EMAIL / AUDIT_ADMIN_PASSWORD)");
}

await browser.close();
console.log(`\n${pagesChecked - pagesBroken}/${pagesChecked} pages fit 360px`);
process.exit(pagesBroken ? 1 : 0);
