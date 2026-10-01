/**
 * Pulls the PaB Store's catalogue into the portal's own copy.
 *
 * Run hourly by cron on the VPS. The shop reads store_books, never the store,
 * so this is the only thing that talks to pickabook.lk -- and if it fails, the
 * last catalogue we saw keeps serving members.
 *
 * Deliberately not copied: `cost`, `seller_payment` and `competitor`. They are
 * the club's margins and the portal has no use for them.
 *
 *   node --env-file=.env.local scripts/sync-store-books.mjs
 */
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORE = (process.env.PAB_STORE_URL ?? "").trim().replace(/\/+$/, "");
const PATH = (process.env.PAB_STORE_BOOKS_PATH ?? "data/books.json").replace(/^\/+/, "");

if (!SB || !SVC) {
  console.error("Missing Supabase env. Run with --env-file=.env.local");
  process.exit(2);
}
if (!STORE) {
  console.error("PAB_STORE_URL is not set; nothing to sync from.");
  process.exit(2);
}

const NON_FICTION = [
  "Business & Money",
  "Self-Help & Psychology",
  "Science & Technology",
  "History & Politics",
  "Biography & Memoir",
  "Health & Wellness",
];

const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const rpc = async (name, body) => {
  const res = await fetch(`${SB}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

function coverFor(raw) {
  const file = String(raw.image ?? "").trim();
  if (file) {
    return /^https?:\/\//i.test(file)
      ? file
      : `${STORE}/images/${encodeURI(file.replace(/^\/+/, ""))}`;
  }
  const isbn = String(raw.isbn ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  // The store's own fallback, through our proxy.
  if (/^[0-9]{9}[0-9X]$|^[0-9]{13}$/.test(isbn)) return `/api/covers/isbn/${isbn}`;
  return null;
}

const token = process.env.PAB_STORE_TOKEN?.trim();
const response = await fetch(`${STORE}/${PATH}`, {
  headers: token ? { "X-PAB-Token": token } : undefined,
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  console.error(`the store answered ${response.status}`);
  process.exit(1);
}

const payload = await response.json();
const rows = Array.isArray(payload) ? payload : (payload.books ?? []);

// Taken before the first write: anything still older at the end was not in
// this catalogue and is retired.
const startedAt = new Date().toISOString();

const books = rows
  .filter((raw) => raw.active !== false && raw.id != null)
  .map((raw) => {
    const cover = coverFor(raw);
    return {
      id: Number(raw.id),
      title: String(raw.title ?? "").trim() || "Untitled",
      author: String(raw.author ?? "").trim(),
      isbn: raw.isbn ?? null,
      category: raw.category ?? null,
      description: (String(raw.description ?? "").trim() || String(raw.tagline ?? "").trim()) || null,
      price: Number(raw.price ?? 0),
      market_price: raw.market_price ?? null,
      stock: Number(raw.stock ?? 0),
      featured: Boolean(raw.featured),
      image: raw.image ?? null,
      cover_url: cover,
      sort_rank:
        (raw.featured ? 4 : 0) +
        (cover ? 2 : 0) +
        (NON_FICTION.includes(raw.category) ? 1 : 0),
    };
  });

let written = 0;
for (let i = 0; i < books.length; i += 250) {
  written += Number(await rpc("sync_store_books", { p_books: books.slice(i, i + 250) }));
}
const retired = Number(await rpc("retire_unsynced_store_books", { p_since: startedAt }));

console.log(
  `${new Date().toISOString()} store sync: ${written} written of ${rows.length} fetched, ` +
    `${retired} retired, ${books.filter((b) => b.cover_url).length} with a cover`,
);
