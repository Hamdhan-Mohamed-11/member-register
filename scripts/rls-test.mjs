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
  // A company employee who has ALSO paid to join the public club. This is the
  // whole point of the multi-club model and the case most likely to leak.
  coBoth: "coboth@rlstest.local",
  pend: "pending@rlstest.local",
};

const ids = {};
for (const [k, e] of Object.entries(emails)) ids[k] = await createUser(e);

async function joinClub(memberId, clubId, { primary = false, status = "active" } = {}) {
  const r = await admin("/rest/v1/club_memberships", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      member_id: memberId, club_id: clubId, status,
      is_primary: primary, joined_on: "2026-01-01", renewal_date: "2027-01-01",
    }),
  });
  const d = await j(r);
  if (!Array.isArray(d) || !d.length) throw new Error(`joinClub: ${JSON.stringify(d)}`);
  return d[0];
}

await patchProfile(ids.admin, { role: "super_admin", status: "active", first_name: "Super", last_name: "Admin" });
await patchProfile(ids.pubA, { status: "active", first_name: "Pub", last_name: "Aye" });
await patchProfile(ids.pubB, { status: "active", first_name: "Pub", last_name: "Bee" });
await patchProfile(ids.coC, { status: "active", first_name: "Co", last_name: "Cee" });
await patchProfile(ids.coD, { status: "active", first_name: "Co", last_name: "Dee" });
await patchProfile(ids.coBoth, { status: "active", first_name: "Co", last_name: "Both" });

await joinClub(ids.admin, pubClub.id, { primary: true });
await joinClub(ids.pubA, pubClub.id, { primary: true });
await joinClub(ids.pubB, pubClub.id, { primary: true });
await joinClub(ids.coC, coClub.id, { primary: true });
await joinClub(ids.coD, coClub.id, { primary: true });
await joinClub(ids.coBoth, coClub.id, { primary: true });
await joinClub(ids.coBoth, pubClub.id);   // paid to join the public club as well
// pend stays status='pending' with NO membership -- what handle_new_user made


console.log("\n--- handle_new_user provisioning ---");
const pendProfile = (await j(await admin(`/rest/v1/profiles?id=eq.${ids.pend}&select=*`)))[0];
check("new signup lands status=pending", pendProfile.status === "pending", `got ${pendProfile.status}`);
const pendMemberships = await j(await admin(`/rest/v1/club_memberships?member_id=eq.${ids.pend}`));
check("new signup lands with no club membership",
  Array.isArray(pendMemberships) && pendMemberships.length === 0, JSON.stringify(pendMemberships));
check("new signup lands role=member", pendProfile.role === "member", `got ${pendProfile.role}`);
check("email mirrored onto profile", pendProfile.email === emails.pend, `got ${pendProfile.email}`);

console.log("\n--- directory visibility ---");
const tokA = await signIn(emails.pubA);
const tokC = await signIn(emails.coC);
const tokD = await signIn(emails.coD);
const tokBoth = await signIn(emails.coBoth);
const tokPend = await signIn(emails.pend);
const tokAdmin = await signIn(emails.admin);

const seenByA = await visibleIds(tokA);
check("public member sees themselves", seenByA.includes(emails.pubA));
check("public member sees another public member", seenByA.includes(emails.pubB));
check("public member CANNOT see company member C", !seenByA.includes(emails.coC), `saw: ${seenByA}`);
check("public member CANNOT see company member D", !seenByA.includes(emails.coD), `saw: ${seenByA}`);
check("public member CANNOT see pending applicant", !seenByA.includes(emails.pend), `saw: ${seenByA}`);
check("public member CAN see the company employee who joined their club",
  seenByA.includes(emails.coBoth), `saw: ${seenByA}`);

const seenByC = await visibleIds(tokC);
check("company member sees their colleague", seenByC.includes(emails.coD), `saw: ${seenByC}`);
check("company member CANNOT see public members", !seenByC.includes(emails.pubA), `saw: ${seenByC}`);
check("company-only member sees the dual-club colleague (shared company club)",
  seenByC.includes(emails.coBoth), `saw: ${seenByC}`);

// The dual-club member is the crux of the multi-club model: they should see
// BOTH sets, and joining a public club must not drag their colleagues into
// public view.
const seenByBoth = await visibleIds(tokBoth);
check("dual-club member sees their company colleagues",
  seenByBoth.includes(emails.coC) && seenByBoth.includes(emails.coD), `saw: ${seenByBoth}`);
check("dual-club member sees public club members",
  seenByBoth.includes(emails.pubA) && seenByBoth.includes(emails.pubB), `saw: ${seenByBoth}`);
check("joining a public club does NOT expose the member's colleagues to it",
  !seenByA.includes(emails.coC) && !seenByA.includes(emails.coD), `public member saw: ${seenByA}`);

// Symmetric check -- visibility must not depend on which colleague is asking.
const seenByD = await visibleIds(tokD);
check("colleague visibility is symmetric", seenByD.includes(emails.coC), `saw: ${seenByD}`);
// coBoth is legitimately in this company club too -- the assertion is that D
// sees the company club and NOTHING beyond it.
const companyClubEmails = [emails.coC, emails.coD, emails.coBoth];
check("company member sees ONLY their own club",
  seenByD.every((e) => companyClubEmails.includes(e)), `saw: ${seenByD}`);

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

// Clubs are rows in club_memberships now, so the escalation to block is
// "insert yourself into a club you never paid for".
const escJoin = await asUser(tokA, "/rest/v1/club_memberships", {
  method: "POST",
  body: JSON.stringify({ member_id: ids.pubA, club_id: coClub.id, status: "active" }),
});
check("member CANNOT insert their own club membership",
  escJoin.status >= 400, `status ${escJoin.status}`);

const escActivate = await asUser(tokA, `/rest/v1/club_memberships?member_id=eq.${ids.pubA}`, {
  method: "PATCH", body: JSON.stringify({ renewal_date: "2099-01-01" }),
});
check("member CANNOT extend their own membership",
  escActivate.status >= 400, `status ${escActivate.status}`);

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

console.log("\n--- onboarding RPCs ---");

async function rpc(token, name, args) {
  const res = await asUser(token, `/rest/v1/rpc/${name}`, {
    method: "POST", body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, body: await j(res) };
}

// A THROWAWAY applicant for the approval flow, so `pend` stays genuinely
// pending. Approving `pend` here would silently activate a fixture that
// scripts/e2e-auth.mjs relies on being stuck on /pending -- the kind of
// cross-suite coupling that produces a failure in the OTHER file.
const applicantEmail = "rpcapplicant@rlstest.local";
const applicantId = await createUser(applicantEmail);
const tokApplicant = await signIn(applicantEmail);

// The single most important check in this file: company clubs are invite-only,
// and request_club_join is the only path a member has into a club.
const joinCompany = await rpc(tokApplicant, "request_club_join", { p_club_id: coClub.id });
check("member CANNOT apply to a company club",
  joinCompany.status >= 400 && /invite only/i.test(JSON.stringify(joinCompany.body)),
  JSON.stringify(joinCompany));

const joinPublic = await rpc(tokApplicant, "request_club_join", { p_club_id: pubClub.id });
check("member CAN apply to a public club", joinPublic.status < 300, JSON.stringify(joinPublic));

const joinTwice = await rpc(tokApplicant, "request_club_join", { p_club_id: pubClub.id });
check("a second application while one is pending is refused",
  joinTwice.status >= 400, JSON.stringify(joinTwice));

const reqId = joinPublic.body;
const selfApprove = await rpc(tokApplicant, "approve_join_request", { p_request_id: reqId });
check("applicant CANNOT approve their own request",
  selfApprove.status >= 400, JSON.stringify(selfApprove));

const memberApprove = await rpc(tokA, "approve_join_request", { p_request_id: reqId });
check("a plain member CANNOT approve a request",
  memberApprove.status >= 400, JSON.stringify(memberApprove));

const adminApprove = await rpc(tokAdmin, "approve_join_request", { p_request_id: reqId });
check("admin CAN approve a request", adminApprove.status < 300, JSON.stringify(adminApprove));

const approved = (await j(await admin(`/rest/v1/profiles?id=eq.${applicantId}&select=status`)))[0];
check("approval activates the account", approved.status === "active", JSON.stringify(approved));

const newMembership = (await j(await admin(
  `/rest/v1/club_memberships?member_id=eq.${applicantId}&select=*`)))[0];
check("approval creates an active membership",
  newMembership?.status === "active", JSON.stringify(newMembership));
check("their first club is marked primary",
  newMembership?.is_primary === true, JSON.stringify(newMembership));
check("approval sets a renewal date",
  Boolean(newMembership?.renewal_date), JSON.stringify(newMembership));

// Privilege boundaries on the admin RPCs
const memberInvite = await rpc(tokA, "create_invite",
  { p_email: "sneaky@rlstest.local", p_club_id: pubClub.id, p_role: "super_admin" });
check("a plain member CANNOT create an invite",
  memberInvite.status >= 400, JSON.stringify(memberInvite));

const memberPromote = await rpc(tokA, "set_member_role",
  { p_member_id: ids.pubA, p_role: "super_admin" });
check("a plain member CANNOT promote themselves via RPC",
  memberPromote.status >= 400, JSON.stringify(memberPromote));

const dupInvite = await rpc(tokAdmin, "create_invite",
  { p_email: emails.pubA, p_club_id: pubClub.id, p_role: "member" });
check("inviting an address that already has an account is refused",
  dupInvite.status >= 400, JSON.stringify(dupInvite));

const goodInvite = await rpc(tokAdmin, "create_invite",
  { p_email: "invited@rlstest.local", p_club_id: coClub.id, p_role: "member" });
check("admin CAN invite someone to a company club",
  goodInvite.status < 300, JSON.stringify(goodInvite));

// Locking yourself out of your own admin area is a one-click mistake.
const demoteLast = await rpc(tokAdmin, "set_member_role",
  { p_member_id: ids.admin, p_role: "member" });
check("the last super admin CANNOT be demoted",
  demoteLast.status >= 400 && /last super admin/i.test(JSON.stringify(demoteLast.body)),
  JSON.stringify(demoteLast));


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
