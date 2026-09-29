import "server-only";

import { getBook, listBooks, listCategories } from "@/lib/legacy/books";
import {
  getStoreBook,
  isStoreConfigured,
  listStoreBooks,
  listStoreCategories,
} from "@/lib/store/books";
import type { BookQuery, LegacyBook, LegacyCategory, LegacyResult } from "@/lib/legacy/types";

/**
 * The catalogue members BUY from.
 *
 * The PaB Store when it is configured, the old HostGator catalogue when it is
 * not. The fallback is not a nicety: without it, deploying this before the
 * store URL is set would empty the shop for everyone, and "the shop is gone"
 * is a worse failure than "the shop is the old one for another hour".
 *
 * BORROWING does not come through here. The lending shelf is the club's own
 * and stays on the legacy catalogue, which is why /library still calls
 * listBooks directly.
 */
export function buyingFromStore(): boolean {
  return isStoreConfigured();
}

export async function listBuyableBooks(
  query: BookQuery = {},
): Promise<LegacyResult<{ books: LegacyBook[]; total: number; page: number; pages: number }>> {
  if (!buyingFromStore()) return listBooks(query);

  const result = await listStoreBooks(query);
  return result.ok ? result : { ok: false, reason: result.reason };
}

export async function getBuyableBook(id: number): Promise<LegacyResult<LegacyBook | null>> {
  if (!buyingFromStore()) return getBook(id);

  const result = await getStoreBook(id);
  return result.ok ? result : { ok: false, reason: result.reason };
}

export async function listBuyableCategories(): Promise<LegacyResult<LegacyCategory[]>> {
  if (!buyingFromStore()) return listCategories();

  const result = await listStoreCategories();
  return result.ok ? result : { ok: false, reason: result.reason };
}
