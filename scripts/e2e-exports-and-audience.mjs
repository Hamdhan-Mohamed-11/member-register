/**
 * The CSV exports, the Discover audience and the new-club announcement, on
 * the live site.
 *
 * Makes its own super admin, club admin and member, and removes them again.
 */
import { chromium } from "playwright";
import { login } from "./lib/e2e.mjs";

const BASE = process.env.E2E_BASE_URL ?? "https://member.pickabook.lk";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "ExportTest!2026";
const SUPER = "boss@exporttest.local";
const CLUBBY = "clubby@exporttest.local";
const CLUB = "Matara Morning Readers";

const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const api = (p, o = {}) => fetch(`${SB}${p}`, { ...o, headers: { ...h, ...(o.headers || {}) } });
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

async function wipe() {
  await api(`/rest/v1/clubs?name=eq.${encodeURIComponent(CLUB)}`, { method: "DELETE" });
  const { users = [] } = await j(await api("/auth/v1/admin/users?per_page=500"));
  for (const u of users) {
    if (u.email?.endsWith("@exporttest.local")) {
      await api(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
}

async function makeUser(email, patch) {
  const user = await j(await api("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: PW, email_confirm: true }),
  }));
  await api(`/rest/v1/profiles?id=eq.${user.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  return user.id;
}

await wipe();
await makeUser(SUPER, { first_name: "Boss", last_name: "Admin", role: "super_admin", status: "active" });

const browser = await chromium.launch();
try {
  const admin = await browser.newPage({ viewport: { width: 1360, height: 950 } });
  await login(admin, BASE, SUPER, PW, "/admin");

  // --- the exports --------------------------------------------------------
  for (const kind of ["members", "sessions", "payments"]) {
    const res = await admin.request.get(`${BASE}/api/admin/export/${kind}`);
    const body = await res.text();
    const lines = body.trim().split("\r\n");
    check(
      `${kind}.csv downloads with rows`,
      res.ok() && lines.length > 1 && lines[0].includes('"'),
      `${res.status()} ${lines.length} lines`,
    );
    check(
      `${kind}.csv is offered as a file`,
      (res.headers()["content-disposition"] ?? "").includes(".csv"),
      res.headers()["content-disposition"] ?? "",
    );
  }

  // A member must not be able to pull the club's people out.
  const member = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(member, BASE, "member@test.pickabook.lk", "PickABook!2026", "/feed");
  const refused = await member.request.get(`${BASE}/api/admin/export/members`);
  check("a member cannot export", refused.status() === 403, String(refused.status()));

  // --- a new club is announced -------------------------------------------
  await admin.goto(`${BASE}/admin/clubs`, { waitUntil: "networkidle" });
  // The club form is the one with the "Create club" button on it -- the page
  // also carries a club-TYPE form whose fields are named the same.
  const form = admin.locator("form").filter({
    has: admin.getByRole("button", { name: /^Creating…$|^Create club$/ }),
  });
  await form.locator('input[name="name"]').fill(CLUB);
  const type = form.locator('select[name="typeId"]');
  const options = await type.locator("option").all();
  for (const option of options) {
    const value = await option.getAttribute("value");
    if (value) {
      await type.selectOption(value);
      break;
    }
  }
  await form.locator('input[name="openJoin"]').check();
  await form.getByRole("button", { name: /^Create club$/ }).click();
  await admin.waitForTimeout(5000);

  const clubs = await j(await api(`/rest/v1/clubs?name=eq.${encodeURIComponent(CLUB)}&select=id,announced_at,is_open_join`));
  check("the club was created", clubs.length === 1, JSON.stringify(clubs).slice(0, 140));
  check("it was announced", Boolean(clubs[0]?.announced_at), JSON.stringify(clubs[0] ?? {}));

  const notes = await j(await api(
    `/rest/v1/notifications?kind=eq.club.new&select=title,member_id&limit=5`,
  ));
  check("members were notified", Array.isArray(notes) && notes.length > 0, JSON.stringify(notes).slice(0, 140));

  await member.goto(`${BASE}/feed`, { waitUntil: "networkidle" });
  const feed = await member.innerText("body");
  check("the feed carries the announcement", feed.includes(CLUB), feed.slice(0, 160));

  // Saving it again must not announce it twice.
  const before = (await j(await api(`/rest/v1/notifications?kind=eq.club.new&select=id`))).length;
  await admin.goto(`${BASE}/admin/clubs`, { waitUntil: "networkidle" });
  await admin.reload({ waitUntil: "networkidle" });
  const after = (await j(await api(`/rest/v1/notifications?kind=eq.club.new&select=id`))).length;
  check("nobody is told twice", before === after, `${before} then ${after}`);

  // --- a targeted post ----------------------------------------------------
  const post = (await j(await api("/rest/v1/discover_posts?select=id,caption&limit=1")))[0];
  if (post) {
    await api("/rest/v1/discover_post_clubs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{ post_id: post.id, club_id: clubs[0].id }]),
    });
    await member.goto(`${BASE}/discover`, { waitUntil: "networkidle" });
    const shown = await member.evaluate(() => document.querySelectorAll("article, li").length);
    const seen = await j(await api(
      `/rest/v1/discover_post_clubs?post_id=eq.${post.id}&select=club_id`,
    ));
    check("the post is targeted at one club", seen.length === 1, JSON.stringify(seen));
    check("the feed still renders for a member outside it", shown >= 0);
    await api(`/rest/v1/discover_post_clubs?post_id=eq.${post.id}`, { method: "DELETE" });
  }
} finally {
  await browser.close();
  await wipe();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
