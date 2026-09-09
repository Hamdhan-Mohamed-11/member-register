import "server-only";

import { isLegacyConfigured } from "./env";
import { legacyQuery } from "./pool";
import {
  breakerIsOpen,
  cacheGet,
  cacheSet,
  recordFailure,
  recordSuccess,
  TTL,
} from "./cache";
import { clean, cleanOrNull, isFlagSet, resolveImageUrl } from "./normalize";
import {
  MAX_PAGE,
  PAGE_SIZE,
  type BookQuery,
  type LegacyBook,
  type LegacyCategory,
  type LegacyResult,
} from "./types";

/**
 * The ONLY module permitted to speak SQL to the legacy database.
 *
 * Every value is a bound parameter. LIMIT and OFFSET are the sole exception --
 * they are clamped integers interpolated deliberately, because MySQL 5.7
 * rejects placeholders in those positions over the text protocol.
 *
 * TARGET IS MYSQL 5.7.44. No CTEs, no window functions, no REGEXP_LIKE.
 * Plain REGEXP works and is used below.
 */

type RawBook = {
  id: number;
  book_name: string | null;
  author: string | null;
  book_by: string | null;
  price: string | null;
  description: string | null;
  isbn: string | null;
  edition: string | null;
  image: string | null;
  status: string | null;
  library: string | null;
  category_id: string | null;
  category_label: string | null;
};

// category_id is MIXED: usually a numeric FK into categories, sometimes free
// text (12,318 numeric against 796 text when this was written). Join only when
// it is actually numeric, and fall back to the raw value as its own label.
const SELECT_COLUMNS = `
  b.id, b.book_name, b.author, b.book_by, b.price, b.description,
  b.isbn, b.edition, b.image, b.status, b.library, b.category_id,
  coalesce(c.category_name, nullif(trim(b.category_id), '')) as category_label
`;

const FROM_JOIN = `
  from books b
  left join categories c
    on c.id = case when b.category_id regexp '^[0-9]+$'
                   then cast(b.category_id as unsigned) end
`;

function toBook(raw: RawBook): LegacyBook {
  return {
    id: Number(raw.id),
    title: clean(raw.book_name) || "Untitled",
    author: clean(raw.author),
    bookBy: clean(raw.book_by),
    // Stays a string the whole way through. Never parseFloat a rupee amount.
    priceLkr: String(raw.price ?? "0"),
    description: cleanOrNull(raw.description),
    isbn: cleanOrNull(raw.isbn),
    edition: cleanOrNull(raw.edition),
    imageUrl: resolveImageUrl(raw.image),
    categoryLabel: cleanOrNull(raw.category_label),
    // VARCHAR "0"/"1" on the legacy side, not integers.
    inStock: isFlagSet(raw.status),
    lendable: isFlagSet(raw.library),
  };
}

function buildWhere(q: BookQuery): { sql: string; params: unknown[] } {
  // Their own PHP excludes this sentinel category everywhere. Matching it keeps
  // our catalogue identical to the one members already know.
  const clauses = ["(b.category_id is null or b.category_id <> 'Demo')"];
  const params: unknown[] = [];

  const search = q.search?.trim();
  if (search) {
    clauses.push("(b.book_name like ? or b.author like ? or b.isbn like ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  if (q.category) {
    clauses.push("b.category_id = ?");
    params.push(q.category);
  }

  if (q.language) {
    // Language is encoded in the TITLE on the legacy side, not in a column.
    // Replicating their substring match is correct rather than lazy: there is
    // nothing else to match on.
    clauses.push("b.book_name like ?");
    params.push(q.language === "tamil" ? "%Tamil%" : "%Sinhala%");
  }

  if (q.availability === "in_stock") clauses.push("b.status = '1'");
  if (q.availability === "pre_order") {
    clauses.push("(b.status is null or b.status <> '1')");
  }
  if (q.lendableOnly) clauses.push("b.library = '1'");

  // b.price is decimal(10,2) on the legacy side, so this compares numerically
  // with no cast -- confirmed against the live catalogue, where cast and
  // uncast return the same rows. Do not "fix" this by wrapping it in a cast:
  // LegacyBook.priceLkr is a STRING in TypeScript for float-precision reasons,
  // which makes the column look like text when it is not, and a cast would
  // stop any future index on price from being used.
  // A NULL price fails both comparisons and drops out, which is right: a book
  // with no price cannot be said to be under a maximum.
  if (q.minPriceLkr != null) {
    clauses.push("b.price >= ?");
    params.push(q.minPriceLkr);
  }
  if (q.maxPriceLkr != null) {
    clauses.push("b.price <= ?");
    params.push(q.maxPriceLkr);
  }

  return { sql: clauses.join(" and "), params };
}

function cacheKey(prefix: string, q: BookQuery): string {
  return `${prefix}:${JSON.stringify({
    s: q.search?.trim() ?? "",
    c: q.category ?? "",
    l: q.language ?? "",
    a: q.availability ?? "",
    b: q.lendableOnly ? 1 : 0,
    lo: q.minPriceLkr ?? "",
    hi: q.maxPriceLkr ?? "",
    p: q.page ?? 1,
  })}`;
}

async function guarded<T>(
  key: string,
  ttlMs: number,
  run: () => Promise<T>,
): Promise<LegacyResult<T>> {
  if (!isLegacyConfigured()) return { ok: false, reason: "unconfigured" };

  const cached = cacheGet<T>(key);
  if (cached !== undefined) return { ok: true, data: cached };

  // Fail instantly rather than making every page wait out the timeout.
  if (breakerIsOpen()) return { ok: false, reason: "unreachable" };

  try {
    const data = await run();
    recordSuccess();
    // Only successes are cached. Caching a failure turns a 30-second blip into
    // a 30-minute outage.
    cacheSet(key, data, ttlMs);
    return { ok: true, data };
  } catch (error) {
    recordFailure();
    const message = error instanceof Error ? error.message : "";
    console.error("[legacy] query failed:", message.slice(0, 200));
    if (message === "legacy_timeout") return { ok: false, reason: "timeout" };
    if (/ECONN|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|denied/i.test(message)) {
      return { ok: false, reason: "unreachable" };
    }
    return { ok: false, reason: "query_error" };
  }
}

export type BookPage = {
  books: LegacyBook[];
  total: number;
  page: number;
  pages: number;
};

export async function listBooks(q: BookQuery): Promise<LegacyResult<BookPage>> {
  const page = Math.min(Math.max(1, Math.trunc(q.page ?? 1)), MAX_PAGE);
  const offset = (page - 1) * PAGE_SIZE;

  return guarded(cacheKey("list", { ...q, page }), TTL.list, async () => {
    const where = buildWhere(q);

    const [rows, counted] = await Promise.all([
      legacyQuery<RawBook[]>(
        `select ${SELECT_COLUMNS} ${FROM_JOIN} where ${where.sql}
         order by b.status desc, b.id desc
         limit ${PAGE_SIZE} offset ${offset}`,
        where.params,
      ),
      legacyQuery<{ n: number }[]>(
        `select count(*) as n ${FROM_JOIN} where ${where.sql}`,
        where.params,
      ),
    ]);

    const total = Number(counted[0]?.n ?? 0);
    return {
      books: rows.map(toBook),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  });
}

export async function getBook(id: number): Promise<LegacyResult<LegacyBook | null>> {
  return guarded(`book:${id}`, TTL.book, async () => {
    const rows = await legacyQuery<RawBook[]>(
      `select ${SELECT_COLUMNS} ${FROM_JOIN} where b.id = ? limit 1`,
      [id],
    );
    return rows.length ? toBook(rows[0]) : null;
  });
}

export type BookSnapshot = {
  title: string;
  author: string;
  priceLkr: string;
  imageUrl: string | null;
};

/**
 * Live prices for a set of books.
 *
 * Checkout calls this instead of trusting anything the client sent or anything
 * cached. Guessing at a price is how a Rs. 4,500 book sells for Rs. 450.
 */
export async function getBookSnapshots(
  ids: number[],
): Promise<LegacyResult<Map<number, BookSnapshot>>> {
  const safeIds = [...new Set(ids)]
    .map((n) => Math.trunc(Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (safeIds.length === 0) return { ok: true, data: new Map() };
  if (!isLegacyConfigured()) return { ok: false, reason: "unconfigured" };

  try {
    const placeholders = safeIds.map(() => "?").join(",");
    const rows = await legacyQuery<RawBook[]>(
      `select b.id, b.book_name, b.author, b.price, b.image
       from books b where b.id in (${placeholders})`,
      safeIds,
    );
    recordSuccess();

    const map = new Map<number, BookSnapshot>();
    for (const r of rows) {
      map.set(Number(r.id), {
        title: clean(r.book_name) || "Untitled",
        author: clean(r.author),
        priceLkr: String(r.price ?? "0"),
        imageUrl: resolveImageUrl(r.image),
      });
    }
    return { ok: true, data: map };
  } catch (error) {
    recordFailure();
    const message = error instanceof Error ? error.message : "";
    console.error("[legacy] price lookup failed:", message.slice(0, 200));
    return { ok: false, reason: "unreachable" };
  }
}

export async function listCategories(): Promise<LegacyResult<LegacyCategory[]>> {
  return guarded("categories", TTL.categories, async () => {
    const [named, freeText] = await Promise.all([
      legacyQuery<{ id: number; category_name: string }[]>(
        "select id, category_name from categories order by category_name",
        [],
      ),
      // Free-text categories exist only on books, never in the categories table.
      legacyQuery<{ category_id: string }[]>(
        `select distinct category_id from books
         where category_id is not null
           and trim(category_id) <> ''
           and category_id <> 'Demo'
           and category_id not regexp '^[0-9]+$'
         order by category_id`,
        [],
      ),
    ]);

    return [
      ...named.map((c) => ({ id: String(c.id), label: clean(c.category_name) })),
      ...freeText.map((c) => ({ id: c.category_id, label: clean(c.category_id) })),
    ].filter((c) => c.label !== "");
  });
}

/** Used by /api/health. Cheap, and deliberately does not populate the cache. */
export async function legacyPing(): Promise<boolean> {
  if (!isLegacyConfigured()) return false;
  try {
    await legacyQuery("select 1", [], 5_000);
    recordSuccess();
    return true;
  } catch {
    recordFailure();
    return false;
  }
}

/**
 * Converts a member-facing price into the shop price the catalogue stores.
 *
 * Members see `shop x (1 - discount)`, so a member typing "under Rs. 1,000"
 * with a 25% discount means "shop price under Rs. 1,333.33". Filtering their
 * figure against the shop column directly would hide books they can afford and
 * show books they cannot.
 *
 * Rounded outwards -- up for a maximum, down for a minimum -- so a book priced
 * exactly at the boundary is included rather than lost to a rounding cent.
 */
export function memberPriceToShopPrice(
  memberPrice: number,
  discountPercent: number,
  bound: "min" | "max",
): number {
  const factor = 1 - Math.min(Math.max(discountPercent, 0), 99.99) / 100;
  const shop = memberPrice / factor;
  return bound === "max" ? Math.ceil(shop * 100) / 100 : Math.floor(shop * 100) / 100;
}
