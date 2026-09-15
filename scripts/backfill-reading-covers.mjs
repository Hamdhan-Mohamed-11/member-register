/**
 * One-off: find Open Library covers for reading-list books added before
 * migration 0033, when the app started looking covers up at add time.
 *
 * Safe to re-run -- it only touches rows whose cover_id is still null, and a
 * book Open Library has no cover for simply stays null (the page shows a
 * placeholder). Paced at a few requests a second to be a polite API client.
 *
 * Run on the VPS: node --env-file=.env.local scripts/backfill-reading-covers.mjs
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SVC) {
  console.error("Missing Supabase env.");
  process.exit(2);
}

const headers = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

async function findCoverId(title, author) {
  const params = new URLSearchParams({ title, limit: "1", fields: "cover_i" });
  if (author?.trim()) params.set("author", author.trim());
  try {
    const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "PickABookMemberPortal/1.0 (member.pickabook.lk)" },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const id = Number(body.docs?.[0]?.cover_i);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

const res = await fetch(
  `${URL}/rest/v1/reading_items?select=id,title,author&cover_id=is.null&limit=1000`,
  { headers },
);
const rows = await res.json();
if (!Array.isArray(rows)) {
  console.error("Could not read reading_items:", rows);
  process.exit(1);
}

let found = 0;
for (const row of rows) {
  const coverId = await findCoverId(row.title, row.author);
  if (coverId) {
    const up = await fetch(`${URL}/rest/v1/reading_items?id=eq.${row.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ cover_id: coverId }),
    });
    if (up.ok) found += 1;
  }
  await new Promise((r) => setTimeout(r, 350));
}

console.log(`${rows.length} books without a cover; found ${found}.`);
