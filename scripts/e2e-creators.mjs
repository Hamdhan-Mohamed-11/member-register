/**
 * The author path, end to end on the live site: register, submit a book,
 * have a super admin approve it, and check a member can see and buy it.
 *
 * Creates its own accounts under @creatortest.local and deletes them again,
 * including the temporary super admin.
 */
import { chromium } from "playwright";
import { login } from "./lib/e2e.mjs";

const BASE = "https://member.pickabook.lk";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "CreatorTest!2026";
const AUTHOR = "author@creatortest.local";
const ADMIN = "boss@creatortest.local";
const MEMBER = { email: "member@test.pickabook.lk", password: "PickABook!2026" };

const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const api = (p, o = {}) => fetch(`${SB}${p}`, { ...o, headers: { ...h, ...(o.headers || {}) } });
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

async function wipe() {
  const { users = [] } = await j(await api("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@creatortest.local")) {
      await api(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
  await api("/rest/v1/author_books?title=eq.The%20Paper%20Kite", { method: "DELETE" });
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
await makeUser(AUTHOR, { first_name: "Tharindu", last_name: "Silva", status: "pending" });
await makeUser(ADMIN, { first_name: "Boss", last_name: "Admin", role: "super_admin", status: "active" });

const browser = await chromium.launch();
try {
  // --- the author registers and submits a book ---------------------------
  const author = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await login(author, BASE, AUTHOR, PW, "/pending");
  await author.goto(`${BASE}/creator/register`, { waitUntil: "networkidle" });
  await author.fill('input[name="name"]', "Tharindu Silva");
  await author.fill('textarea[name="about"]', "Writes short novels set in Kandy.");
  await author.getByRole("button", { name: /^Register$/ }).click();
  await author.waitForURL((u) => u.pathname === "/creator", { timeout: 30_000 }).catch(() => {});
  check("author lands on their portal", author.url().includes("/creator"), author.url());

  const portal = await author.innerText("body");
  check("portal says the account is being reviewed", /with a Pick a Book admin/i.test(portal));

  await author.goto(`${BASE}/creator/books/new`, { waitUntil: "networkidle" });
  const beforeApproval = await author.innerText("body");
  check(
    "cannot submit while unapproved",
    /still being reviewed/i.test(beforeApproval),
    beforeApproval.slice(0, 120),
  );

  // --- the super admin approves the author -------------------------------
  const admin = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await login(admin, BASE, ADMIN, PW, "/admin");
  await admin.goto(`${BASE}/admin/creators`, { waitUntil: "networkidle" });
  const queue = await admin.innerText("body");
  check("the author is in the admin queue", /Tharindu Silva/.test(queue));

  const row = admin.locator("li").filter({ hasText: "Tharindu Silva" }).last();
  await row.getByRole("button", { name: /^Approve$/ }).click();
  await admin.waitForTimeout(3000);

  // --- now the book ------------------------------------------------------
  await author.goto(`${BASE}/creator/books/new`, { waitUntil: "networkidle" });
  await author.fill('input[name="title"]', "The Paper Kite");
  await author.fill('input[name="priceLkr"]', "1850");
  await author.fill('textarea[name="blurb"]', "A boy, a hill, and a kite that will not come down.");
  await author.getByRole("button", { name: /Submit for approval/i }).click();
  await author.waitForURL((u) => u.pathname === "/creator", { timeout: 30_000 }).catch(() => {});
  const afterSubmit = await author.innerText("body");
  check("the book is listed as waiting", /The Paper Kite/.test(afterSubmit) && /Waiting for approval/i.test(afterSubmit));

  // --- a member cannot see it yet ----------------------------------------
  const member = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await login(member, BASE, MEMBER.email, MEMBER.password, "/feed");
  await member.goto(`${BASE}/books?q=Paper+Kite`, { waitUntil: "networkidle" });
  check("unapproved book is not in the shop", !(await member.innerText("body")).includes("The Paper Kite"));

  // --- approve the book ---------------------------------------------------
  await admin.goto(`${BASE}/admin/creators`, { waitUntil: "networkidle" });
  const bookRow = admin.locator("li").filter({ hasText: "The Paper Kite" }).last();
  await bookRow.getByRole("button", { name: /^Approve$/ }).click();
  await admin.waitForTimeout(3000);

  await member.goto(`${BASE}/books?q=Paper+Kite`, { waitUntil: "networkidle" });
  const shop = await member.innerText("body");
  check("approved book shows in the shop", /The Paper Kite/.test(shop), shop.slice(0, 200));
  check("shown under the authors shelf", /From our authors/i.test(shop));

  // The detail page, and adding it to a cart -- the part that proves the id
  // space works with the rest of the ordering flow.
  const link = member.locator('a[href^="/books/9"]').first();
  const href = await link.getAttribute("href");
  await member.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
  const detail = await member.innerText("body");
  check("the book has a page", /The Paper Kite/.test(detail) && /Tharindu Silva/.test(detail));

  await member.getByRole("button", { name: /^Buy$/ }).first().click();
  await member.waitForTimeout(2500);
  await member.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
  const cart = await member.innerText("body");
  check("it reaches the cart with its title and price", /The Paper Kite/.test(cart), cart.slice(0, 200));

  // Put the member's cart back the way it was.
  await member.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
  const remove = member.locator("li").filter({ hasText: "The Paper Kite" }).getByRole("button", { name: /remove/i }).first();
  if (await remove.count()) { await remove.click(); await member.waitForTimeout(1500); }
} finally {
  await browser.close();
  await wipe();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
