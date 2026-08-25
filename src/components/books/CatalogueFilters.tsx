import Link from "next/link";
import type { LegacyCategory } from "@/lib/legacy/types";

const selectClass =
  "min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-600";

/**
 * Search and filters as a plain GET form.
 *
 * No client JavaScript: the state lives in the URL, so a filtered catalogue is
 * linkable, survives a refresh, and works on a poor connection before any
 * bundle has loaded. Submitting resets to page 1 simply by not carrying `page`.
 */
export function CatalogueFilters({
  action,
  categories,
  current,
  showAvailability = true,
}: {
  action: string;
  categories: LegacyCategory[];
  current: {
    search?: string;
    category?: string;
    language?: string;
    availability?: string;
  };
  showAvailability?: boolean;
}) {
  return (
    <form method="get" action={action} className="space-y-2">
      <input
        type="search"
        name="q"
        defaultValue={current.search ?? ""}
        placeholder="Search by title, author or ISBN…"
        className={`${selectClass} w-full`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <select name="category" defaultValue={current.category ?? ""} className={selectClass}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select name="language" defaultValue={current.language ?? ""} className={selectClass}>
          <option value="">All languages</option>
          <option value="tamil">Tamil</option>
          <option value="sinhala">Sinhala</option>
        </select>

        {showAvailability ? (
          <select
            name="availability"
            defaultValue={current.availability ?? ""}
            className={selectClass}
          >
            <option value="">Stock and pre-order</option>
            <option value="in_stock">In stock only</option>
            <option value="pre_order">Pre-order only</option>
          </select>
        ) : null}
      </div>

      <button
        type="submit"
        className="min-h-11 w-full sm:w-auto px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
      >
        Search
      </button>
    </form>
  );
}

/** Page links that preserve every active filter. */
export function CataloguePager({
  basePath,
  params,
  page,
  pages,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pages: number;
}) {
  if (pages <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  // A window around the current page rather than every page: 13,000 books is
  // 300-odd pages and nobody wants that as a list.
  const from = Math.max(1, page - 2);
  const to = Math.min(pages, page + 2);
  const window: number[] = [];
  for (let p = from; p <= to; p++) window.push(p);

  const linkClass =
    "min-h-11 min-w-11 px-3 grid place-items-center rounded-lg border border-line text-sm";

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
      {page > 1 ? (
        <Link href={href(page - 1)} className={`${linkClass} text-ink-muted hover:bg-canvas`}>
          Previous
        </Link>
      ) : null}

      {from > 1 ? (
        <>
          <Link href={href(1)} className={`${linkClass} text-ink-muted hover:bg-canvas`}>
            1
          </Link>
          <span className="text-ink-faint px-1">…</span>
        </>
      ) : null}

      {window.map((p) => (
        <Link
          key={p}
          href={href(p)}
          aria-current={p === page ? "page" : undefined}
          className={
            p === page
              ? `${linkClass} bg-brand-600 text-white border-brand-600 font-medium`
              : `${linkClass} text-ink-muted hover:bg-canvas`
          }
        >
          {p}
        </Link>
      ))}

      {to < pages ? (
        <>
          <span className="text-ink-faint px-1">…</span>
          <Link href={href(pages)} className={`${linkClass} text-ink-muted hover:bg-canvas`}>
            {pages}
          </Link>
        </>
      ) : null}

      {page < pages ? (
        <Link href={href(page + 1)} className={`${linkClass} text-ink-muted hover:bg-canvas`}>
          Next
        </Link>
      ) : null}
    </nav>
  );
}
