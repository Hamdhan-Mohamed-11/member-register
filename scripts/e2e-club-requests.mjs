/**
 * Bringing an outside club in, end to end on the live site.
 *
 * An applicant with an account but no club applies at /clubs/new, a super
 * admin approves, and the club exists -- private, with the applicant as its
 * club admin. Cleans up its own accounts, the club it created, and the
 * application row.
 */
import { chromium } from "playwright";
import { login } from "./lib/e2e.mjs";

const BASE = process.env.E2E_BASE_URL ?? "https://member.pickabook.lk";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "ClubTest!2026";
const APPLICANT = "founder@clubtest.local";
const ADMIN = "boss@clubtest.local";
const CLUB = "Galle Fort Readers";

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
  await api(`/rest/v1/club_requests?club_name=eq.${encodeURIComponent(CLUB)}`, { method: "DELETE" });
  const { users = [] } = await j(await api("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@clubtest.local")) {
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
const applicantId = await makeUser(APPLICANT, {
  first_name: "Dilani", last_name: "Fernando", status: "pending",
});
await makeUser(ADMIN, {
  first_name: "Boss", last_name: "Admin", role: "super_admin", status: "active",
});

const browser = await chromium.launch();
try {
  const applicant = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await login(applicant, BASE, APPLICANT, PW, "/pending");

  await applicant.goto(`${BASE}/clubs/new`, { waitUntil: "networkidle" });
  await applicant.fill('input[name="clubName"]', CLUB);
  await applicant.fill('input[name="city"]', "Galle");
  await applicant.fill('input[name="meets"]', "First Sunday of the month");
  await applicant.fill('input[name="memberCount"]', "18");
  await applicant.fill('textarea[name="description"]', "Fiction and travel writing, in the fort.");
  await applicant.getByRole("button", { name: /^Apply$/ }).click();
  await applicant.waitForTimeout(4000);
  check(
    "the applicant is told it is with Pick a Book",
    /with Pick a Book/i.test(await applicant.innerText("body")),
  );

  const admin = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await login(admin, BASE, ADMIN, PW, "/admin");
  await admin.goto(`${BASE}/admin/club-requests`, { waitUntil: "networkidle" });
  const queue = await admin.innerText("body");
  check("the application is in the admin queue", queue.includes(CLUB), queue.slice(0, 200));
  check("it carries the applicant and the details", /Dilani Fernando/.test(queue) && /Galle/.test(queue));

  const row = admin.locator("li").filter({ hasText: CLUB }).last();
  await row.getByRole("button", { name: /^Approve$/ }).click();
  await admin.getByRole("button", { name: /Create the club/i }).click();
  await admin.waitForTimeout(4000);

  const club = await j(await api(`/rest/v1/clubs?name=eq.${encodeURIComponent(CLUB)}&select=id,is_active,is_open_join,admin_id,slug`));
  check("the club was created", Array.isArray(club) && club.length === 1, JSON.stringify(club).slice(0, 160));
  check("it is private", club[0]?.is_open_join === false);
  check("it is active", club[0]?.is_active === true);
  check("the applicant is its admin", club[0]?.admin_id === applicantId);
  check("it has a readable slug", /^galle-fort-readers/.test(club[0]?.slug ?? ""), club[0]?.slug);

  const profile = await j(await api(`/rest/v1/profiles?id=eq.${applicantId}&select=role,status`));
  check("the applicant is now a club admin", profile[0]?.role === "club_admin", JSON.stringify(profile[0]));

  // And their portal is the admin one, for their club only.
  await applicant.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const theirAdmin = await applicant.innerText("body");
  check("they land in the admin area for their club", theirAdmin.includes(CLUB), theirAdmin.slice(0, 200));
  check(
    "they do not get the super admin's sections",
    !/Club applications/.test(theirAdmin) && !/Authors and publishers/.test(theirAdmin),
  );

  // The club is private, so it must not appear in the public join picker.
  const anon = await browser.newPage();
  await anon.goto(`${BASE}/join`, { waitUntil: "networkidle" });
  check("a private club is not offered on /join", !(await anon.innerText("body")).includes(CLUB));
} finally {
  await browser.close();
  await wipe();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
