/**
 * Looks titles up in the legacy shop catalogue, read-only, and prints the ids
 * that have a cover image -- for pointing demo orders, carts and wishlists at
 * books that really exist with the right picture.
 *
 * Run on the VPS:
 *   node --env-file=.env.local scripts/showcase/find-books.mjs "Title one" "Title two"
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.LEGACY_MYSQL_HOST,
  port: Number(process.env.LEGACY_MYSQL_PORT ?? 3306),
  user: process.env.LEGACY_MYSQL_USER,
  password: process.env.LEGACY_MYSQL_PASSWORD,
  database: process.env.LEGACY_MYSQL_DATABASE,
});

for (const title of process.argv.slice(2)) {
  const [rows] = await conn.execute(
    `select id, book_name, author, price, library, image
       from books
      where book_name like ? and coalesce(trim(image), '') <> ''
      order by length(book_name)
      limit 3`,
    [`%${title}%`],
  );
  if (!rows.length) console.log(`${title}\t-- none`);
  for (const r of rows) {
    console.log(`${title}\t${r.id}\t${r.book_name}\t${r.author}\t${r.price}\tlibrary=${r.library}`);
  }
}
await conn.end();
