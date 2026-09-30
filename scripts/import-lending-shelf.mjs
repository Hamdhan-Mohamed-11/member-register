/**
 * Brings the club's lending books across from the old shop database.
 *
 * `library_books` over there is the shelf as it was before the shop's own
 * catalogue was emptied: twenty titles with quantities. They are the club's
 * own books, so they belong in the portal rather than in a database being
 * migrated out from under us.
 *
 * Covers are NOT brought across -- the files those rows name are not served
 * anywhere we could find -- so each book arrives without one and an admin
 * uploads it at /admin/library/shelf.
 *
 * Idempotent on title + author: running it twice does not double the shelf.
 *
 * Run ON the VPS:
 *   node --env-file=.env.local scripts/import-lending-shelf.mjs [--dry]
 */
import mysql from "mysql2/promise";

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

const conn = await mysql.createConnection({
  host: process.env.LEGACY_MYSQL_HOST,
  port: Number(process.env.LEGACY_MYSQL_PORT ?? 3306),
  user: process.env.LEGACY_MYSQL_USER,
  password: process.env.LEGACY_MYSQL_PASSWORD,
  database: process.env.LEGACY_MYSQL_DATABASE,
  connectTimeout: 8000,
});

const [rows] = await conn.query(
  `select id, bookname, author, isbn, description, qty, status, category_id
   from library_books order by id`,
);
await conn.end();
console.log(`old shelf: ${rows.length} rows`);

const existing = await j(await api("/rest/v1/library_shelf?select=title,author"));
const seen = new Set(
  (Array.isArray(existing) ? existing : []).map(
    (b) => `${b.title}`.toLowerCase().trim() + "|" + `${b.author ?? ""}`.toLowerCase().trim(),
  ),
);

const toAdd = [];
for (const row of rows) {
  const title = String(row.bookname ?? "").trim();
  if (!title) continue;
  const author = String(row.author ?? "").trim();
  if (seen.has(`${title.toLowerCase()}|${author.toLowerCase()}`)) continue;

  // The old description column holds a readagon URL rather than a blurb on
  // every row we looked at, so it is dropped rather than shown to members as
  // if it described the book.
  const description = String(row.description ?? "").trim();
  toAdd.push({
    title,
    author,
    isbn: String(row.isbn ?? "").trim() || null,
    description: /^https?:\/\//i.test(description) ? null : description || null,
    copies: Math.max(0, Number(row.qty ?? 1)),
    // status '1' was "on the shelf" on the old side.
    is_active: String(row.status ?? "1").trim() === "1",
  });
}

console.log(`${toAdd.length} to import, ${rows.length - toAdd.length} already there or blank`);
for (const b of toAdd) console.log(`  ${b.title} — ${b.author || "?"} (${b.copies})`);

if (DRY) {
  console.log("\n--dry: nothing written");
  process.exit(0);
}
if (toAdd.length === 0) process.exit(0);

const inserted = await j(
  await api("/rest/v1/library_shelf", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(toAdd),
  }),
);
console.log(
  Array.isArray(inserted)
    ? `\nimported ${inserted.length}`
    : `\nfailed: ${JSON.stringify(inserted).slice(0, 300)}`,
);
