import "server-only";

import { getBookSnapshots } from "@/lib/legacy/books";
import { getAuthorBookSnapshots, isAuthorBookId } from "@/lib/creators/shop";
import type { BookSnapshot } from "@/lib/legacy/books";

/**
 * Titles, prices and covers for a set of book ids, wherever they come from.
 *
 * The shop has two catalogues behind it -- the legacy one on HostGator and the
 * club's own authors -- and a cart line, a wishlist row or an order item can
 * hold either. Every page that needs to put a name to an id goes through here
 * rather than calling the legacy lookup directly, so a book by one of the
 * club's authors never shows up as a blank row priced at zero.
 *
 * The legacy half can fail (it is someone else's database); the author half
 * cannot in the same way. A legacy failure is not allowed to lose the author
 * books that were also asked for, which is why the two results are merged
 * rather than returned as one all-or-nothing answer.
 */
export async function getShopSnapshots(
  ids: number[],
): Promise<Map<number, BookSnapshot>> {
  const legacyIds = ids.filter((id) => !isAuthorBookId(id));

  const [legacy, authored] = await Promise.all([
    legacyIds.length ? getBookSnapshots(legacyIds) : null,
    getAuthorBookSnapshots(ids),
  ]);

  const merged = new Map<number, BookSnapshot>(
    legacy && legacy.ok ? legacy.data : [],
  );
  for (const [id, snap] of authored) merged.set(id, snap);
  return merged;
}
