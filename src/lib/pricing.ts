import "server-only";

/**
 * Member pricing for legacy catalogue books.
 *
 * All arithmetic is on integer cents. Rupee amounts through a JS float and
 * back are how a total ends up a cent adrift from the sum of its lines, which
 * is exactly the kind of thing nobody notices until an invoice is disputed.
 *
 * The portal's discount is INDEPENDENT of the legacy site's own (10% at the
 * time of writing). Never derive one from the other -- they are separate
 * business decisions that happen to be similar today.
 */

export function toCents(amount: string | number): number {
  const s = String(amount).trim();
  const negative = s.startsWith("-");
  const [whole = "0", frac = ""] = s.replace(/^-/, "").split(".");
  const cents =
    Number(whole.replace(/[^0-9]/g, "") || 0) * 100 +
    Number((frac + "00").slice(0, 2).replace(/[^0-9]/g, "") || 0);
  return negative ? -cents : cents;
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatLkrCents(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString("en-LK");
  const frac = String(abs % 100).padStart(2, "0");
  return `LKR ${cents < 0 ? "-" : ""}${whole}${frac === "00" ? "" : `.${frac}`}`;
}

/**
 * Rounds half up, matching what a person doing the sum by hand would get.
 * Math.round already does this for positives; being explicit documents intent.
 */
export function memberPriceCents(listCents: number, discountPercent: number): number {
  const pct = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  return Math.round((listCents * (100 - pct)) / 100);
}

export type PricedLine = {
  listCents: number;
  memberCents: number;
  savedCents: number;
};

export function priceLine(listPrice: string | number, discountPercent: number): PricedLine {
  const listCents = toCents(listPrice);
  const memberCents = memberPriceCents(listCents, discountPercent);
  return { listCents, memberCents, savedCents: listCents - memberCents };
}
