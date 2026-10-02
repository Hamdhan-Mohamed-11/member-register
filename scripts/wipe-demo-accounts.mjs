/**
 * Removes every account but one, and the files they left behind.
 *
 * Through the Auth admin API rather than SQL: deleting a row in auth.users by
 * hand leaves sessions and identities behind, and a stale refresh token is a
 * way back into an account that no longer exists. profiles cascade from
 * auth.users, so memberships, wishlists, borrow requests and the rest go with
 * each person.
 *
 * Storage is cleaned the same way -- through the API, so the files on disk go
 * rather than only the rows that describe them. The lending shelf's covers and
 * the shop's are kept; everything else was demonstration.
 *
 *   node --env-file=.env.local scripts/wipe-demo-accounts.mjs --dry
 *   node --env-file=.env.local scripts/wipe-demo-accounts.mjs
 */
const KEEP = (process.env.WIPE_KEEP_EMAIL ?? "kimivibecode@gmail.com").toLowerCase();
const DRY = process.argv.includes("--dry");

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SVC) {
  console.error("Missing Supabase env. Run with --env-file=.env.local");
  process.exit(2);
}

const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const api = (p, o = {}) => fetch(`${SB}${p}`, { ...o, headers: { ...h, ...(o.headers || {}) } });
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

// --- accounts --------------------------------------------------------------

const { users = [] } = await j(await api("/auth/v1/admin/users?per_page=500"));
const doomed = users.filter((u) => (u.email ?? "").toLowerCase() !== KEEP);
const kept = users.filter((u) => (u.email ?? "").toLowerCase() === KEEP);

console.log(`${users.length} accounts; keeping ${kept.length ? kept[0].email : "NOBODY"}`);
if (kept.length === 0) {
  console.error(`\n${KEEP} is not in this project. Refusing to delete every account.`);
  process.exit(1);
}
for (const u of doomed) console.log(`  ${DRY ? "would delete" : "deleting"} ${u.email}`);

if (!DRY) {
  for (const u of doomed) {
    const res = await api(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) console.error(`  failed on ${u.email}: ${res.status} ${await res.text()}`);
  }
}

// --- the files they left ---------------------------------------------------
//
// Everything in these buckets belonged to the demonstration: photographs from
// sessions that no longer exist, flyers for them, covers for author books that
// have been deleted. Avatars go too, except the one account that stays.

const WIPE_BUCKETS = ["discover", "flyers", "book-covers"];
const keptId = kept[0].id;

async function listAll(bucket, prefix = "") {
  const res = await api(`/storage/v1/object/list/${bucket}`, {
    method: "POST",
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });
  const rows = await j(res);
  if (!Array.isArray(rows)) return [];

  const files = [];
  for (const row of rows) {
    // A row with no id is a folder: Storage fakes directories with prefixes.
    if (row.id == null) files.push(...(await listAll(bucket, `${prefix}${row.name}/`)));
    else files.push(`${prefix}${row.name}`);
  }
  return files;
}

for (const bucket of [...WIPE_BUCKETS, "avatars"]) {
  let files = await listAll(bucket);
  if (bucket === "avatars") files = files.filter((f) => !f.startsWith(`${keptId}/`));
  if (files.length === 0) {
    console.log(`${bucket}: nothing to remove`);
    continue;
  }

  console.log(`${bucket}: ${DRY ? "would remove" : "removing"} ${files.length} files`);
  if (DRY) continue;

  for (let i = 0; i < files.length; i += 100) {
    const res = await api(`/storage/v1/object/${bucket}`, {
      method: "DELETE",
      body: JSON.stringify({ prefixes: files.slice(i, i + 100) }),
    });
    if (!res.ok) console.error(`  ${bucket}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  }
}

// --- what is left ----------------------------------------------------------

const left = await j(await api("/auth/v1/admin/users?per_page=500"));
const profiles = await j(await api("/rest/v1/profiles?select=email,role"));
console.log(
  `\n${DRY ? "(dry run) " : ""}accounts now: ${(left.users ?? []).length}` +
    `, profiles: ${Array.isArray(profiles) ? profiles.length : "?"}`,
);
if (Array.isArray(profiles)) for (const p of profiles) console.log(`  ${p.email} (${p.role})`);
