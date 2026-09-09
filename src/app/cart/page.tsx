import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClassName } from "@/components/ui/Button";
import { PlaceOrderForm, QuantityStepper } from "./CartClient";
import { requireActiveMember } from "@/lib/auth/session";
import { getCart } from "@/lib/orders/queries";
import { getBookSnapshots } from "@/lib/legacy/books";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { formatLkrCents, priceLine } from "@/lib/pricing";

export const metadata: Metadata = { title: "Basket" };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  await requireActiveMember();

  const supabase = await getServerComponentSupabase();
  const [cart, { data: settings }] = await Promise.all([
    getCart(),
    supabase
      .from("app_settings")
      .select("book_discount_percent, readrise_percent")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const discount = Number(settings?.book_discount_percent ?? 0);
  const readrisePercent = Number(settings?.readrise_percent ?? 0);

  // Live prices, not the ones cached when the book went in the basket. A
  // basket that quotes last week's price and then charges this week's is the
  // single most annoying thing a shop can do.
  const snapshots = await getBookSnapshots(cart.map((l) => l.bookId));
  const byId = snapshots.ok ? snapshots.data : new Map();

  const lines = cart.map((line) => {
    const snap = byId.get(line.bookId);
    const cents = snap ? priceLine(snap.priceLkr, discount).memberCents : null;
    return {
      ...line,
      title: snap?.title || line.title,
      author: snap?.author || line.author,
      unitCents: cents,
      lineCents: cents == null ? null : cents * line.quantity,
    };
  });

  const knownTotal = lines.reduce((sum, l) => sum + (l.lineCents ?? 0), 0);
  const anyUnpriced = lines.some((l) => l.unitCents == null);
  const readriseCents = Math.round((knownTotal * readrisePercent) / 100);

  return (
    <AppShell>
      <PageHeader
        title="Your basket"
        description="Send it to the club and they'll confirm the price before anything is paid."
        action={
          <Link href="/orders" className={buttonClassName("secondary", "sm")}>
            My orders
          </Link>
        }
      />

      {cart.length === 0 ? (
        <Card flush>
          <EmptyState
            title="Your basket is empty"
            description="Find something in the catalogue and tap Buy."
            action={
              <Link href="/books" className={buttonClassName("secondary", "sm")}>
                Browse books
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card flush>
            <ul className="divide-y divide-line">
              {lines.map((line) => (
                <li key={line.bookId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/books/${line.bookId}`} className="min-w-0 group">
                      <p className="font-medium text-ink group-hover:text-brand-600">
                        {line.title || `Book #${line.bookId}`}
                      </p>
                      {line.author ? (
                        <p className="text-sm text-ink-muted truncate">{line.author}</p>
                      ) : null}
                    </Link>
                    <p className="text-sm font-medium text-ink shrink-0 tabular-nums">
                      {line.lineCents == null ? "—" : formatLkrCents(line.lineCents)}
                    </p>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <QuantityStepper bookId={line.bookId} quantity={line.quantity} />
                    <p className="text-xs text-ink-faint tabular-nums">
                      {line.unitCents == null
                        ? "price to be confirmed"
                        : `${formatLkrCents(line.unitCents)} each`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {anyUnpriced ? (
            <Card tone="warning">
              <p className="text-sm text-ink">
                We couldn&apos;t reach the catalogue for every book just now, so
                one or more prices are missing. You can still send the order —
                the club confirms every price anyway.
              </p>
            </Card>
          ) : null}

          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink-muted">Estimated total</span>
              <span className="font-display text-2xl text-ink tabular-nums">
                {formatLkrCents(knownTotal)}
              </span>
            </div>

            {readrisePercent > 0 && knownTotal > 0 ? (
              <p className="mt-2 text-sm text-brand-700 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                {formatLkrCents(readriseCents)} of this goes to{" "}
                <span className="font-medium">Read and Rise</span>, putting books
                into schools.
              </p>
            ) : null}

            <div className="mt-4">
              <PlaceOrderForm total={formatLkrCents(knownTotal)} />
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
