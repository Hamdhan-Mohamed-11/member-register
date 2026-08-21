/**
 * Points and session-pricing correctness.
 *
 * The two things that must never be wrong:
 *
 *   1. A member's points_balance always equals the sum of their activities.
 *      It is a denormalised cache maintained by a trigger, so it is exactly
 *      the kind of value that drifts silently and is discovered months later.
 *
 *   2. A guest is quoted the fee the SERVER computes, never one a client
 *      supplies, and host-club members are never charged for their own club.
 *
 * Run: npm run test:points
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "TestPassw0rd!2026";

if (!URL || !ANON || !SVC) {
  console.error("Missing Supabase env. Run via `npm run test:points`.");
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

async function signIn(email) {
  const d = await j(await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  }));
  if (!d.access_token) throw new Error(`signIn ${email}: ${JSON.stringify(d)}`);
  return d.access_token;
}

const asUser = (token, p, o = {}) =>
  fetch(`${URL}${p}`, {
    ...o,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(o.headers || {}) },
  });

async function rpc(token, name, args) {
  const res = await asUser(token, `/rest/v1/rpc/${name}`, {
    method: "POST", body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, body: await j(res) };
}

async function balanceOf(id) {
  const r = await j(await admin(`/rest/v1/profiles?id=eq.${id}&select=points_balance`));
  return r?.[0]?.points_balance;
}

/** Must always return zero rows: the standing drift check. */
async function drift() {
  const r = await j(await admin("/rest/v1/rpc/points_drift_check", { method: "POST", body: "{}" }));
  return r;
}

// --- fixtures -------------------------------------------------------------
const EMAILS = {
  admin: "ptadmin@rlstest.local",
  hostA: "pthosta@rlstest.local",
  hostB: "pthostb@rlstest.local",
  guest: "ptguest@rlstest.local",
};

async function wipe() {
  const { users = [] } = await j(await admin("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@rlstest.local")) {
      await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
  await admin("/rest/v1/sessions?title=like.PT *", { method: "DELETE" });
  await admin("/rest/v1/clubs?slug=eq.pt-guest-club", { method: "DELETE" });
}

console.log("Preparing...");
await wipe();

const hostClub = (await j(await admin("/rest/v1/clubs?slug=eq.public-club&select=id")))[0];
const guestClub = (await j(await admin("/rest/v1/clubs", {
  method: "POST", headers: { Prefer: "return=representation" },
  body: JSON.stringify({ name: "PT Guest Club", slug: "pt-guest-club", kind: "public" }),
})))[0];

const ids = {};
for (const [k, email] of Object.entries(EMAILS)) {
  const u = await j(await admin("/auth/v1/admin/users", {
    method: "POST", body: JSON.stringify({ email, password: PW, email_confirm: true }),
  }));
  ids[k] = u.id;
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "active",
      role: k === "admin" ? "super_admin" : "member",
      first_name: k.toUpperCase(), last_name: "Test",
    }),
  });
}

async function join(memberId, clubId) {
  await admin("/rest/v1/club_memberships", {
    method: "POST",
    body: JSON.stringify({
      member_id: memberId, club_id: clubId, status: "active",
      is_primary: true, joined_on: "2026-01-01", renewal_date: "2027-01-01",
    }),
  });
}
await join(ids.admin, hostClub.id);
await join(ids.hostA, hostClub.id);
await join(ids.hostB, hostClub.id);
await join(ids.guest, guestClub.id);

const tokAdmin = await signIn(EMAILS.admin);
const tokHostA = await signIn(EMAILS.hostA);
const tokGuest = await signIn(EMAILS.guest);

// --- sessions -------------------------------------------------------------
console.log("\n--- session creation ---");

const freeSession = await rpc(tokAdmin, "upsert_session", {
  p_session_id: null, p_host_club_id: hostClub.id,
  p_title: "PT Free Session", p_book_title: "Dune", p_book_author: "Frank Herbert",
  p_held_at: "2026-09-01T18:00:00Z", p_pricing_kind: "free",
});
check("admin can create a free session", freeSession.status < 300, JSON.stringify(freeSession));

const paidSession = await rpc(tokAdmin, "upsert_session", {
  p_session_id: null, p_host_club_id: hostClub.id,
  p_title: "PT Paid Session", p_book_title: "Piranesi", p_book_author: "Susanna Clarke",
  p_held_at: "2026-09-08T18:00:00Z", p_pricing_kind: "paid", p_guest_fee: 1500,
});
check("admin can create a paid session", paidSession.status < 300, JSON.stringify(paidSession));

const badPaid = await rpc(tokAdmin, "upsert_session", {
  p_session_id: null, p_host_club_id: hostClub.id,
  p_title: "PT Broken", p_held_at: "2026-09-09T18:00:00Z",
  p_book_title: "", p_book_author: "",
  p_pricing_kind: "paid", p_guest_fee: 0,
});
check("a paid session with no fee is refused", badPaid.status >= 400, JSON.stringify(badPaid));

const memberCreate = await rpc(tokHostA, "upsert_session", {
  p_session_id: null, p_host_club_id: hostClub.id,
  p_title: "PT Sneaky", p_book_title: "", p_book_author: "",
  p_held_at: "2026-09-10T18:00:00Z", p_pricing_kind: "free",
});
check("a plain member cannot create a session", memberCreate.status >= 400, JSON.stringify(memberCreate));

const freeId = freeSession.body;
const paidId = paidSession.body;

// --- pricing --------------------------------------------------------------
console.log("\n--- pricing ---");

const feeHostFree = await rpc(tokHostA, "session_fee_for", { p_session_id: freeId, p_member_id: ids.hostA });
check("free session costs a host-club member nothing", Number(feeHostFree.body) === 0, JSON.stringify(feeHostFree));

const feeGuestFree = await rpc(tokGuest, "session_fee_for", { p_session_id: freeId, p_member_id: ids.guest });
check("free session costs a guest nothing", Number(feeGuestFree.body) === 0, JSON.stringify(feeGuestFree));

const feeHostPaid = await rpc(tokHostA, "session_fee_for", { p_session_id: paidId, p_member_id: ids.hostA });
check("paid session is FREE for the host club's own member",
  Number(feeHostPaid.body) === 0, JSON.stringify(feeHostPaid));

const feeGuestPaid = await rpc(tokGuest, "session_fee_for", { p_session_id: paidId, p_member_id: ids.guest });
check("paid session charges a member of another club",
  Number(feeGuestPaid.body) === 1500, JSON.stringify(feeGuestPaid));

// --- booking --------------------------------------------------------------
console.log("\n--- booking ---");

const hostBooking = await rpc(tokHostA, "book_session", { p_session_id: paidId });
check("host-club member can book a paid session", hostBooking.status < 300, JSON.stringify(hostBooking));

let bookings = await j(await admin(`/rest/v1/session_bookings?session_id=eq.${paidId}&select=*`));
const hostRow = bookings.find((b) => b.member_id === ids.hostA);
check("their booking is confirmed immediately", hostRow?.status === "confirmed", JSON.stringify(hostRow));
check("their booking is free", Number(hostRow?.fee_lkr) === 0, JSON.stringify(hostRow));

const guestBooking = await rpc(tokGuest, "book_session", { p_session_id: paidId });
check("guest can book a paid session", guestBooking.status < 300, JSON.stringify(guestBooking));

bookings = await j(await admin(`/rest/v1/session_bookings?session_id=eq.${paidId}&select=*`));
const guestRow = bookings.find((b) => b.member_id === ids.guest);
check("the guest's booking waits for payment",
  guestRow?.status === "pending_payment", JSON.stringify(guestRow));
check("the guest's booking snapshots the fee",
  Number(guestRow?.fee_lkr) === 1500, JSON.stringify(guestRow));

// The fee must come from the server, not the caller.
const forged = await asUser(tokGuest, "/rest/v1/session_bookings", {
  method: "POST",
  body: JSON.stringify({ session_id: paidId, member_id: ids.guest, status: "confirmed", fee_lkr: 0 }),
});
check("a member CANNOT write their own booking row", forged.status >= 400, String(forged.status));

// --- points ---------------------------------------------------------------
console.log("\n--- points ---");

await rpc(tokAdmin, "record_session_attendance", {
  p_session_id: freeId,
  p_entries: [{ member_id: ids.hostA, codes: ["attend"] }],
});
check("attending is worth 10", (await balanceOf(ids.hostA)) === 10, String(await balanceOf(ids.hostA)));

// THE stacking rule: presenting at a session you also attended is 30, not 20.
await rpc(tokAdmin, "record_session_attendance", {
  p_session_id: freeId,
  p_entries: [{ member_id: ids.hostA, codes: ["attend", "present"] }],
});
check("attending AND presenting stacks to 30",
  (await balanceOf(ids.hostA)) === 30, String(await balanceOf(ids.hostA)));

// Unticking must actually remove, not just fail to add.
await rpc(tokAdmin, "record_session_attendance", {
  p_session_id: freeId,
  p_entries: [{ member_id: ids.hostA, codes: ["attend"] }],
});
check("removing the presentation drops back to 10",
  (await balanceOf(ids.hostA)) === 10, String(await balanceOf(ids.hostA)));

await rpc(tokAdmin, "record_session_attendance", {
  p_session_id: freeId,
  p_entries: [{ member_id: ids.hostA, codes: [] }],
});
check("clearing everything drops to 0",
  (await balanceOf(ids.hostA)) === 0, String(await balanceOf(ids.hostA)));

// Points accumulate ACROSS sessions.
await rpc(tokAdmin, "record_session_attendance", {
  p_session_id: freeId,
  p_entries: [{ member_id: ids.hostB, codes: ["attend", "present"] }],
});
await rpc(tokAdmin, "record_session_attendance", {
  p_session_id: paidId,
  p_entries: [{ member_id: ids.hostB, codes: ["attend", "guest_session"] }],
});
check("points add up across sessions (30 + 20)",
  (await balanceOf(ids.hostB)) === 50, String(await balanceOf(ids.hostB)));

const memberRecord = await rpc(tokHostA, "record_session_attendance", {
  p_session_id: freeId,
  p_entries: [{ member_id: ids.hostA, codes: ["present"] }],
});
check("a plain member cannot record attendance",
  memberRecord.status >= 400, JSON.stringify(memberRecord));

const forgedActivity = await asUser(tokHostA, "/rest/v1/member_activities", {
  method: "POST",
  body: JSON.stringify({
    session_id: freeId, member_id: ids.hostA, activity_code: "present", points_awarded: 9999,
  }),
});
check("a member CANNOT insert their own activity",
  forgedActivity.status >= 400, String(forgedActivity.status));

// --- concurrency ----------------------------------------------------------
console.log("\n--- concurrent writes ---");

// Fire overlapping saves at once. If the trigger used a delta, or took the
// aggregate before the lock, this is where the balance would drift.
const burst = [];
for (let i = 0; i < 12; i++) {
  burst.push(rpc(tokAdmin, "record_session_attendance", {
    p_session_id: i % 2 === 0 ? freeId : paidId,
    p_entries: [
      { member_id: ids.hostA, codes: ["attend"] },
      { member_id: ids.hostB, codes: ["attend", "present"] },
      { member_id: ids.guest, codes: ["attend"] },
    ],
  }));
}
const results = await Promise.all(burst);
const errored = results.filter((r) => r.status >= 400);
check("no concurrent save failed", errored.length === 0, JSON.stringify(errored.slice(0, 2)));

for (const [name, id, expected] of [
  ["hostA", ids.hostA, 20],   // attend on both sessions
  ["hostB", ids.hostB, 60],   // attend+present on both
  ["guest", ids.guest, 20],   // attend on both
]) {
  const actual = await balanceOf(id);
  check(`${name}'s balance is exact after the burst (${expected})`,
    actual === expected, `got ${actual}`);
}

const drifted = await j(await admin(
  "/rest/v1/member_activities?select=member_id,points_awarded"));
const sums = new Map();
for (const a of drifted) sums.set(a.member_id, (sums.get(a.member_id) ?? 0) + a.points_awarded);
let driftCount = 0;
for (const [memberId, expected] of sums) {
  if ((await balanceOf(memberId)) !== expected) driftCount++;
}
check("no member's cached balance has drifted from their activities",
  driftCount === 0, `${driftCount} drifted`);

if (!process.env.KEEP) { console.log("\nCleaning up..."); await wipe(); }
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
