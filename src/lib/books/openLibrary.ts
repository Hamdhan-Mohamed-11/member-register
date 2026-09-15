import "server-only";

/**
 * Finds an Open Library cover for a book a member typed in by hand.
 *
 * Best effort and quick: this runs inside "add to my reading list", and a
 * member should never wait on, or be refused because of, a third-party search.
 * Anything short of a clean answer -- a timeout, a non-200, no match, a match
 * with no cover -- is null, and the book shows the placeholder instead.
 */
export async function findOpenLibraryCoverId(
  title: string,
  author?: string | null,
): Promise<number | null> {
  const params = new URLSearchParams({ title, limit: "1", fields: "cover_i" });
  if (author?.trim()) params.set("author", author.trim());

  try {
    const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
      signal: AbortSignal.timeout(3500),
      headers: { "User-Agent": "PickABookMemberPortal/1.0 (member.pickabook.lk)" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { docs?: { cover_i?: unknown }[] };
    const id = Number(body.docs?.[0]?.cover_i);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
