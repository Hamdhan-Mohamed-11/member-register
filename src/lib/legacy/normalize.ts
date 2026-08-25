import { LEGACY_UPLOAD_BASE } from "./env";

/**
 * Resolves the legacy `image` column to a URL.
 *
 * The column holds either an absolute URL or a bare filename such as
 * `book_69bba2e29a8c6.jpg`, which lives under the legacy uploads directory.
 */
export function resolveImageUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  // encodeURI, not encodeURIComponent: a few filenames contain a subpath and
  // the slash must survive.
  return LEGACY_UPLOAD_BASE + encodeURI(v.replace(/^\/+/, ""));
}

/**
 * `status` and `library` are VARCHAR on the legacy side, holding "0"/"1" --
 * NOT integers, whatever the PHP implies by comparing them with ==. A numeric
 * comparison silently matches nothing, so the flag is read as a string.
 */
export function isFlagSet(raw: unknown): boolean {
  return String(raw ?? "").trim() === "1";
}

/** Trims and collapses the whitespace that litters the legacy text columns. */
export function clean(raw: unknown): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

export function cleanOrNull(raw: unknown): string | null {
  const v = clean(raw);
  return v === "" ? null : v;
}
