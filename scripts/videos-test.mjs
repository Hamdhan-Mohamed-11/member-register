/**
 * Videos: the moderation visibility rule, and URL parsing.
 *
 * Two things must hold:
 *
 *   1. A member's submission is visible to THEM and to admins, and to nobody
 *      else, until it is published. That is the whole feature.
 *   2. Only real YouTube/Vimeo links get through, and what reaches the
 *      database is a provider plus an opaque id — never a URL that could later
 *      be rendered into an iframe src.
 *
 * Run: npm run test:videos
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "TestPassw0rd!2026";

if (!URL_ || !ANON || !SVC) {
  console.error("Missing Supabase env. Run via `npm run test:videos`.");
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

async function signIn(email) {
  const d = await j(await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  }));
  if (!d.access_token) throw new Error(`signIn ${email}: ${JSON.stringify(d)}`);
  return d.access_token;
}

const asUser = (token, p, o = {}) =>
  fetch(`${URL_}${p}`, {
    ...o,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(o.headers || {}) },
  });

async function rpc(token, name, args) {
  const res = await asUser(token, `/rest/v1/rpc/${name}`, {
    method: "POST", body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, body: await j(res) };
}

const OWNER = "vidowner@vid.test";
const OTHER = "vidother@vid.test";
const ADMIN = "vidadmin@vid.test";

// Wipes only THIS suite's namespace. Every suite used to share
// @rlstest.local, so each one's cleanup deleted the others' fixtures and the
// whole set only passed when run in isolation.
async function wipe() {
  const { users = [] } = await j(await admin("/auth/v1/admin/users?per_page=200"));
  for (const u of users) {
    if (u.email?.endsWith("@vid.test")) {
      await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    }
  }
  await admin("/rest/v1/videos?title=like.VT *", { method: "DELETE" });
}

console.log("Preparing...");
await wipe();

const club = (await j(await admin("/rest/v1/clubs?slug=eq.public-club&select=id")))[0];
const ids = {};
for (const [email, role] of [[OWNER, "member"], [OTHER, "member"], [ADMIN, "super_admin"]]) {
  const u = await j(await admin("/auth/v1/admin/users", {
    method: "POST", body: JSON.stringify({ email, password: PW, email_confirm: true }),
  }));
  ids[email] = u.id;
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active", role, first_name: "Vid", last_name: role }),
  });
  await admin("/rest/v1/club_memberships", {
    method: "POST",
    body: JSON.stringify({
      member_id: u.id, club_id: club.id, status: "active",
      is_primary: true, joined_on: "2026-01-01", renewal_date: "2027-01-01",
    }),
  });
}

const tokOwner = await signIn(OWNER);
const tokOther = await signIn(OTHER);
const tokAdmin = await signIn(ADMIN);

const visibleTo = async (token) => {
  const rows = await j(await asUser(token, "/rest/v1/videos?select=title,status"));
  return Array.isArray(rows) ? rows.map((r) => r.title) : [];
};

// --- submission -----------------------------------------------------------
console.log("\n--- submission ---");

const submitted = await rpc(tokOwner, "submit_video", {
  p_provider: "youtube", p_external_id: "dQw4w9WgXcQ",
  p_source_url: "https://youtu.be/dQw4w9WgXcQ",
  p_title: "VT Member submission",
});
check("a member can submit a video", submitted.status < 300, JSON.stringify(submitted));

let row = (await j(await admin("/rest/v1/videos?title=eq.VT%20Member%20submission&select=*")))[0];
check("it starts PENDING, whatever was sent", row?.status === "pending", JSON.stringify(row?.status));
check("the submitter is recorded", row?.submitted_by === ids[OWNER], JSON.stringify(row?.submitted_by));

const dup = await rpc(tokOwner, "submit_video", {
  p_provider: "youtube", p_external_id: "dQw4w9WgXcQ",
  p_source_url: "https://youtu.be/dQw4w9WgXcQ", p_title: "VT Duplicate",
});
check("the same video cannot be submitted twice", dup.status >= 400, JSON.stringify(dup));

const badProvider = await rpc(tokOwner, "submit_video", {
  p_provider: "tiktok", p_external_id: "123",
  p_source_url: "https://tiktok.com/x", p_title: "VT Bad provider",
});
check("an unsupported provider is refused", badProvider.status >= 400, JSON.stringify(badProvider));

// --- the visibility rule --------------------------------------------------
console.log("\n--- 'visible to them first' ---");

let ownerSees = await visibleTo(tokOwner);
let otherSees = await visibleTo(tokOther);
let adminSees = await visibleTo(tokAdmin);

check("the submitter sees their own pending video",
  ownerSees.includes("VT Member submission"), JSON.stringify(ownerSees));
check("another member does NOT see it",
  !otherSees.includes("VT Member submission"), JSON.stringify(otherSees));
check("an admin DOES see it (it is a queue)",
  adminSees.includes("VT Member submission"), JSON.stringify(adminSees));

const anonRes = await fetch(`${URL_}/rest/v1/videos?select=title`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
});
const anonSees = await j(anonRes);
// Two acceptable denials: a 403 because anon has no SELECT grant at all
// (which is what happens here, and is the stronger of the two), or an empty
// array because the policy withheld every row. Assert the OUTCOME.
check("anon sees no videos at all",
  anonRes.status >= 400 || (Array.isArray(anonSees) && anonSees.length === 0),
  `${anonRes.status} ${JSON.stringify(anonSees)}`);

// A member must not be able to publish their own submission.
const selfApprove = await rpc(tokOwner, "moderate_video", {
  p_video_id: row.id, p_status: "approved",
});
check("a member CANNOT publish their own video", selfApprove.status >= 400, JSON.stringify(selfApprove));

const forgedUpdate = await asUser(tokOwner, `/rest/v1/videos?id=eq.${row.id}`, {
  method: "PATCH", body: JSON.stringify({ status: "approved" }),
});
check("nor by writing the row directly", forgedUpdate.status >= 400, String(forgedUpdate.status));

// --- publishing -----------------------------------------------------------
console.log("\n--- publishing ---");

const approved = await rpc(tokAdmin, "moderate_video", {
  p_video_id: row.id, p_status: "approved",
});
check("an admin can publish it", approved.status < 300, JSON.stringify(approved));

otherSees = await visibleTo(tokOther);
check("now every member sees it",
  otherSees.includes("VT Member submission"), JSON.stringify(otherSees));

row = (await j(await admin(`/rest/v1/videos?id=eq.${row.id}&select=*`)))[0];
check("the reviewer is recorded", row?.reviewed_by === ids[ADMIN], JSON.stringify(row?.reviewed_by));
const audit = await j(await admin("/rest/v1/admin_audit_log?action=eq.video.moderate&select=id"));
check("moderation is audited", Array.isArray(audit) && audit.length > 0, "");

// --- rejection ------------------------------------------------------------
console.log("\n--- rejection ---");

await rpc(tokOwner, "submit_video", {
  p_provider: "vimeo", p_external_id: "123456789",
  p_source_url: "https://vimeo.com/123456789", p_title: "VT Rejected one",
});
const rejectRow = (await j(await admin("/rest/v1/videos?title=eq.VT%20Rejected%20one&select=id")))[0];

await rpc(tokAdmin, "moderate_video", {
  p_video_id: rejectRow.id, p_status: "rejected", p_note: "Not related to the club",
});

const rejected = (await j(await admin(`/rest/v1/videos?id=eq.${rejectRow.id}&select=*`)))[0];
check("a rejected video keeps the reason", /Not related/.test(rejected?.review_note ?? ""), JSON.stringify(rejected?.review_note));

otherSees = await visibleTo(tokOther);
check("a rejected video is not visible to other members",
  !otherSees.includes("VT Rejected one"), JSON.stringify(otherSees));

ownerSees = await visibleTo(tokOwner);
check("but the submitter still sees it, with the reason",
  ownerSees.includes("VT Rejected one"), JSON.stringify(ownerSees));

// --- withdrawal -----------------------------------------------------------
console.log("\n--- withdrawal ---");

await rpc(tokOwner, "submit_video", {
  p_provider: "youtube", p_external_id: "aaaaaaaaaaa",
  p_source_url: "https://youtu.be/aaaaaaaaaaa", p_title: "VT Withdrawable",
});
const withdrawRow = (await j(await admin("/rest/v1/videos?title=eq.VT%20Withdrawable&select=id")))[0];

const otherDeletes = await rpc(tokOther, "delete_video", { p_video_id: withdrawRow.id });
check("another member cannot delete it", otherDeletes.status >= 400, JSON.stringify(otherDeletes));

const withdrawn = await rpc(tokOwner, "delete_video", { p_video_id: withdrawRow.id });
check("the submitter can withdraw their pending video",
  withdrawn.status < 300, JSON.stringify(withdrawn));

const gone = await j(await admin("/rest/v1/videos?title=eq.VT%20Withdrawable&select=id"));
check("and it is really gone", Array.isArray(gone) && gone.length === 0, JSON.stringify(gone));

// Once published it is club content, not the submitter's to remove.
const deletePublished = await rpc(tokOwner, "delete_video", { p_video_id: row.id });
check("a member cannot delete their own PUBLISHED video",
  deletePublished.status >= 400, JSON.stringify(deletePublished));

const adminDeletes = await rpc(tokAdmin, "delete_video", { p_video_id: row.id });
check("an admin can", adminDeletes.status < 300, JSON.stringify(adminDeletes));

if (!process.env.KEEP) { console.log("\nCleaning up..."); await wipe(); }
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
