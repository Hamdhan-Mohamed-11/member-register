import "server-only";

import { getBookSnapshots } from "@/lib/legacy/books";
import { getAuthorBookSnapshots, isAuthorBookId } from "@/lib/creators/shop";
import { getStoreSnapshots, isStoreBookId } from "@/lib/store/books";
import { getShelfSnapshots, isShelfBookId } from "@/lib/library/shelf";
import type { BookSnapshot } from "@/lib/legacy/books";

/**
 * Titles, prices and covers for a set of book ids, wherever they come from.
 *
 * Four things can be behind a book id: the store members buy from, the club's
 * own lending shelf, the club's authors, and the old HostGator catalogue that
 * past orders still point at. Every page that needs to put a name to an id goes through here
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
  const legacyIds = ids.filter(
    (id) => !isAuthorBookId(id) && !isStoreBookId(id) && !isShelfBookId(id),
  );

  const [legacy, authored, fromStore, fromShelf] = await Promise.all([
    legacyIds.length ? getBookSnapshots(legacyIds) : null,
    getAuthorBookSnapshots(ids),
    getStoreSnapshots(ids),
    getShelfSnapshots(ids),
  ]);

  const merged = new Map<number, BookSnapshot>(
    legacy && legacy.ok ? legacy.data : [],
  );
  for (const [id, snap] of fromStore) merged.set(id, snap);
  for (const [id, snap] of fromShelf) merged.set(id, snap);
  for (const [id, snap] of authored) merged.set(id, snap);
  return merged;
}
