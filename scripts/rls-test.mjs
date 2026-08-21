/**
 * Security gate: verifies the directory visibility rule and the
 * privileged-column protection against the RAW PostgREST endpoint, using real
 * signed-in sessions. UI-level checking proves nothing here, so this talks to
 * PostgREST directly with real user access tokens.
 *
 * Run:              npm run test:rls
 * Keep fixtures:    KEEP=1 npm run test:rls
 *
 * Creates then deletes users under @rlstest.local. Safe to re-run.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SVC) {
  console.error(
    "Missing Supabase env vars. Run via `npm run test:rls`, which loads .env.local.",
  );
  process.exit(2);
}

const PW = "TestPassw0rd!2026";
const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

async function j(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } }

async function admin(path, opts = {}) {
  return fetch(`${URL}${path}`, { ...opts, headers: { ...svcH, ...(opts.headers || {}) } });
}

// --- cleanup -------------------------------------------------------------
async function wipeTestUsers() {
  const r = await admin("/auth/v1/admin/users?per_page=200");
  const { users = [] } = await j(r);
  for (const u of users) {
    if (u.email?.endsWith("@rlstest.local")) {
      await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
  await admin("/rest/v1/clubs?slug=eq.acme-club", { method: "DELETE" });
  await admin("/rest/v1/companies?slug=eq.acme", { method: "DELETE" });
}

async function createUser(email) {
  const r = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: PW, email_confirm: true }),
  });
  const u = await j(r);
  if (!u.id) throw new Error(`createUser ${email}: ${JSON.stringify(u)}`);
  return u.id;
}

async function patchProfile(id, patch) {
  const r = await admin(`/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  const d = await j(r);
  if (!Array.isArray(d) || !d.length) throw new Error(`patchProfile ${id}: ${JSON.stringify(d)}`);
  return d[0];
}

async function signIn(email) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  const d = await j(r);
  if (!d.access_token) throw new Error(`signIn ${email}: ${JSON.stringify(d)}`);
  return d.access_token;
}

// Query PostgREST AS a given user.
async function asUser(token, path, opts = {}) {
  return fetch(`${URL}${path}`, {
    ...opts,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
}

async function visibleIds(token) {
  const r = await asUser(token, "/rest/v1/profiles?select=id,email");
  const d = await j(r);
  if (!Array.isArray(d)) throw new Error(`visibleIds: ${JSON.stringify(d)}`);
  return d.map((p) => p.email);
}

// --- run -----------------------------------------------------------------
console.log("Cleaning up any previous run...");
await wipeTestUsers();

console.log("Seeding fixtures...");
// public club (from 0004 seed)
const pubClub = (await j(await admin("/rest/v1/clubs?slug=eq.public-club&select=id")))[0];
if (!pubClub) throw new Error("seeded public club missing");

// a company + its club
const company = (await j(await admin("/rest/v1/companies", {
  method: "POST", headers: { Prefer: "return=representation" },
  body: JSON.stringify({ name: "Acme Ltd", slug: "acme" }),
})))[0];
const coClub = (await j(await admin("/rest/v1/clubs", {
  method: "POST", headers: { Prefer: "return=representation" },
  body: JSON.stringify({ name: "Acme Club", slug: "acme-club", kind: "company", company_id: company.id }),
})))[0];

const emails = {
  admin: "admin@rlstest.local",
  pubA: "puba@rlstest.local",
  pubB: "pubb@rlstest.local",
  coC: "coc@rlstest.local",
  coD: "cod@rlstest.local",
  pend: "pending@rlstest.local",
};

const ids = {};
for (const [k, e] of Object.entries(emails)) ids[k] = await createUser(e);

await patchProfile(ids.admin, { role: "super_admin", status: "active", club_id: pubClub.id, first_name: "Super", last_name: "Admin" });
await patchProfile(ids.pubA, { status: "active", club_id: pubClub.id, first_name: "Pub", last_name: "Aye" });
await patchProfile(ids.pubB, { status: "active", club_id: pubClub.id, first_name: "Pub", last_name: "Bee" });
await patchProfile(ids.coC, { status: "active", club_id: coClub.id, first_name: "Co", last_name: "Cee" });
await patchProfile(ids.coD, { status: "active", club_id: coClub.id, first_name: "Co", last_name: "Dee" });
// pend stays status='pending', club_id=null -- exactly what handle_new_user made

console.log("\n--- handle_new_user provisioning ---");
const pendProfile = (await j(await admin(`/rest/v1/profiles?id=eq.${ids.pend}&select=*`)))[0];
check("new signup lands status=pending", pendProfile.status === "pending", `got ${pendProfile.status}`);
check("new signup lands with no club", pendProfile.club_id === null, `got ${pendProfile.club_id}`);
check("new signup lands role=member", pendProfile.role === "member", `got ${pendProfile.role}`);
check("email mirrored onto profile", pendProfile.email === emails.pend, `got ${pendProfile.email}`);

console.log("\n--- directory visibility ---");
const tokA = await signIn(emails.pubA);
const tokC = await signIn(emails.coC);
const tokD = await signIn(emails.coD);
const tokPend = await signIn(emails.pend);
const tokAdmin = await signIn(emails.admin);

const seenByA = await visibleIds(tokA);
check("public member sees themselves", seenByA.includes(emails.pubA));
check("public member sees another public member", seenByA.includes(emails.pubB));
check("public member CANNOT see company member C", !seenByA.includes(emails.coC), `saw: ${seenByA}`);
check("public member CANNOT see company member D", !seenByA.includes(emails.coD), `saw: ${seenByA}`);
check("public member CANNOT see pending applicant", !seenByA.includes(emails.pend), `saw: ${seenByA}`);

const seenByC = await visibleIds(tokC);
check("company member sees their colleague", seenByC.includes(emails.coD), `saw: ${seenByC}`);
check("company member CANNOT see public members", !seenByC.includes(emails.pubA), `saw: ${seenByC}`);

// Symmetric check -- visibility must not depend on which colleague is asking.
const seenByD = await visibleIds(tokD);
check("colleague visibility is symmetric", seenByD.includes(emails.coC), `saw: ${seenByD}`);
check("company member sees ONLY their own club",
  seenByD.every((e) => e === emails.coC || e === emails.coD), `saw: ${seenByD}`);

const seenByPend = await visibleIds(tokPend);
check("pending applicant sees ONLY themselves",
  seenByPend.length === 1 && seenByPend[0] === emails.pend, `saw: ${seenByPend}`);

const seenByAdmin = await visibleIds(tokAdmin);
check("super admin sees everyone", Object.values(emails).every((e) => seenByAdmin.includes(e)),
  `saw ${seenByAdmin.length} of ${Object.keys(emails).length}`);

console.log("\n--- targeted lookup (not just list) ---");
const directCbyA = await j(await asUser(tokA, `/rest/v1/profiles?id=eq.${ids.coC}&select=*`));
check("public member direct-fetching a company member gets nothing",
  Array.isArray(directCbyA) && directCbyA.length === 0, JSON.stringify(directCbyA));

console.log("\n--- privilege escalation ---");
const escRole = await asUser(tokA, `/rest/v1/profiles?id=eq.${ids.pubA}`, {
  method: "PATCH", body: JSON.stringify({ role: "super_admin" }),
});
check("member CANNOT set their own role", escRole.status >= 400, `status ${escRole.status}`);

const escPoints = await asUser(tokA, `/rest/v1/profiles?id=eq.${ids.pubA}`, {
  method: "PATCH", body: JSON.stringify({ points_balance: 99999 }),
});
check("member CANNOT set their own points_balance", escPoints.status >= 400, `status ${escPoints.status}`);

const escRenewal = await asUser(tokA, `/rest/v1/profiles?id=eq.${ids.pubA}`, {
  method: "PATCH", body: JSON.stringify({ renewal_date: "2099-01-01" }),
});
check("member CANNOT set their own renewal_date", escRenewal.status >= 400, `status ${escRenewal.status}`);

const escClub = await asUser(tokA, `/rest/v1/profiles?id=eq.${ids.pubA}`, {
  method: "PATCH", body: JSON.stringify({ club_id: coClub.id }),
});
check("member CANNOT move themselves into a company club", escClub.status >= 400, `status ${escClub.status}`);

const legit = await asUser(tokA, `/rest/v1/profiles?id=eq.${ids.pubA}`, {
  method: "PATCH", body: JSON.stringify({ bio: "hello", first_name: "Pub" }),
});
check("member CAN edit their own bio/name", legit.status < 300, `status ${legit.status} ${await legit.text()}`);

const otherRow = await asUser(tokA, `/rest/v1/profiles?id=eq.${ids.pubB}`, {
  method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ bio: "pwned" }),
});
const otherBody = await j(otherRow);
check("member CANNOT edit another member's row",
  !Array.isArray(otherBody) || otherBody.length === 0, JSON.stringify(otherBody));

console.log("\n--- anon exposure ---");
const anonProfiles = await fetch(`${URL}/rest/v1/profiles?select=*`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
});
const anonBody = await j(anonProfiles);
check("anon gets NO profiles",
  anonProfiles.status >= 400 || (Array.isArray(anonBody) && anonBody.length === 0),
  `status ${anonProfiles.status} ${JSON.stringify(anonBody)}`);

const anonClubs = await fetch(`${URL}/rest/v1/clubs?select=id,name,kind`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
});
const anonClubBody = await j(anonClubs);
check("anon CAN read public clubs (needed by /join)",
  Array.isArray(anonClubBody) && anonClubBody.some((c) => c.kind === "public"),
  JSON.stringify(anonClubBody));
check("anon CANNOT read company clubs",
  Array.isArray(anonClubBody) && !anonClubBody.some((c) => c.kind === "company"),
  JSON.stringify(anonClubBody));

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
if (!process.env.KEEP) {
  console.log("Cleaning up test users...");
  await wipeTestUsers();
}
process.exit(fail ? 1 : 0);
