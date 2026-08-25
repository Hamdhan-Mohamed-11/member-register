export type LegacyBook = {
  id: number;
  title: string;
  author: string;
  /** Publisher/imprint on the legacy side; often blank. */
  bookBy: string;
  /** Kept as a STRING. Rupee amounts through a JS float come back a cent short. */
  priceLkr: string;
  description: string | null;
  isbn: string | null;
  edition: string | null;
  imageUrl: string | null;
  categoryLabel: string | null;
  /** `status = '1'` on the legacy side. Everything else is pre-order. */
  inStock: boolean;
  /** `library = '1'` — available to borrow. */
  lendable: boolean;
};

export type BookQuery = {
  search?: string;
  category?: string;
  language?: "tamil" | "sinhala";
  availability?: "in_stock" | "pre_order";
  lendableOnly?: boolean;
  page?: number;
};

export type LegacyCategory = { id: string; label: string };

/**
 * Every legacy call returns this rather than throwing.
 *
 * HostGator is a third party we do not control, and a page that 500s because
 * someone else's database is busy is a worse outcome than a page that says the
 * catalogue is briefly unavailable.
 */
export type LegacyResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unconfigured" | "unreachable" | "timeout" | "query_error" };

export const PAGE_SIZE = 40;
export const MAX_PAGE = 500;
