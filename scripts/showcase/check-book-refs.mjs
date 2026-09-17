/**
 * Read-only: lists every book referenced by orders, carts, wishlists and
 * borrow requests whose stored title does not match what the shop catalogue
 * says that id is. A mismatch shows the wrong cover and, in the cart, the
 * wrong title.
 *
 *   node --env-file=.env.local scripts/showcase/check-book-refs.mjs [titles to search...]
 */
import mysql from "mysql2/promise";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };
const get = async (p) => (await fetch(`${URL}/rest/v1${p}`, { headers: H })).json();

const refs = new Map();
for (const [table, cols] of [
  ["book_order_items", "book_id,title"],
  ["cart_items", "book_id,title"],
  ["book_wishlist", "book_id,title"],
  ["borrow_requests", "book_id,title"],
]) {
  for (const r of await get(`/${table}?select=${cols}`)) {
    const key = Number(r.book_id);
    if (!refs.has(key)) refs.set(key, { titles: new Set(), tables: new Set() });
    refs.get(key).titles.add(r.title);
    refs.get(key).tables.add(table);
  }
}

const conn = await mysql.createConnection({
  host: process.env.LEGACY_MYSQL_HOST,
  port: Number(process.env.LEGACY_MYSQL_PORT ?? 3306),
  user: process.env.LEGACY_MYSQL_USER,
  password: process.env.LEGACY_MYSQL_PASSWORD,
  database: process.env.LEGACY_MYSQL_DATABASE,
});

const ids = [...refs.keys()];
const [rows] = await conn.query(`select id, book_name, author, image from books where id in (?)`, [ids]);
const byId = new Map(rows.map((r) => [Number(r.id), r]));
for (const [id, ref] of refs) {
  const cat = byId.get(id);
  const stored = [...ref.titles].join(" | ");
  const ok = cat && [...ref.titles].every((t) => cat.book_name.toLowerCase().includes(t.toLowerCase().slice(0, 12)));
  console.log(`${ok ? "ok  " : "MISM"} ${id}\tstored: ${stored}\tcatalogue: ${cat ? cat.book_name : "(missing)"}\t[${[...ref.tables].join(",")}]`);
}

for (const title of process.argv.slice(2)) {
  const [found] = await conn.execute(
    `select id, book_name, author, price from books
      where book_name like ? and coalesce(trim(image), '') <> ''
      order by length(book_name) limit 2`,
    [`%${title}%`],
  );
  for (const r of found) console.log(`FIND ${title}\t${r.id}\t${r.book_name}\t${r.author}\t${r.price}`);
  if (!found.length) console.log(`FIND ${title}\t-- none`);
}
await conn.end();
