import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClassName } from "@/components/ui/Button";
import { BookCover } from "@/components/books/BookCover";
import { CancelOrderButton } from "./OrderClient";
import { OPEN_STATUSES, STATUS, formatWhen, orderRef } from "./status";
import { requireActiveMember } from "@/lib/auth/session";
import { getMyOrders, type BookOrder } from "@/lib/orders/queries";
import { getShopSnapshots } from "@/lib/shop/snapshots";
import { formatLkrCents } from "@/lib/pricing";

export const metadata: Metadata = { title: "My orders" };
export const dynamic = "force-dynamic";

const lkr = (value: number) => formatLkrCents(Math.round(value * 100));

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "past", label: "Past" },
] as const;

/** The line under the total, saying what happens next for this order. */
function nextStep(order: BookOrder): string {
  switch (order.status) {
    case "review":
      return "The club is checking prices and stock. Nothing is charged until you agree.";
    case "quoted":
      return "The club has come back with a different price. Open the order to answer.";
    case "agreed":
      return "Price confirmed. Open the order to pay.";
    case "paid":
      return "Paid. The club will let you know when it is ready to collect.";
    case "fulfilled":
      return "Collected. Enjoy the read.";
    case "declined":
      return "You turned down the club's price, so nothing was charged.";
    case "cancelled":
      return "Cancelled. Nothing was charged.";
  }
}

function OrderCard({
  order,
  covers,
}: {
  order: BookOrder;
  covers: Map<number, string | null>;
}) {
  const total = order.agreedTotal ?? order.askingTotal;
  const open = OPEN_STATUSES.includes(order.status);
  const first = order.items[0];
  const copies = order.items.reduce((n, i) => n + i.quantity, 0);
  const authors = [
    ...new Set(order.items.map((i) => i.author).filter(Boolean)),
  ];
  const title =
    order.items.length === 1
      ? first?.title || `Book #${first?.bookId}`
      : `${order.items.length} books`;

  return (
    <li className="min-w-0">
      <Card className="h-full">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-faint">
            <span className="font-medium text-ink-muted">
              {orderRef(order.id)}
            </span>
            {" · "}
            {formatWhen(order.createdAt)}
          </p>
          <Badge tone={STATUS[order.status].tone}>
            {STATUS[order.status].label}
          </Badge>
        </div>

        <Link href={`/orders/${order.id}`} className="group mt-2 block">
          <h2 className="line-clamp-2 font-display text-lg leading-snug text-ink group-hover:text-brand-600">
            {title}
          </h2>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {copies} cop{copies === 1 ? "y" : "ies"}
            {authors.length ? ` · ${authors.join(", ")}` : ""}
          </p>
        </Link>

        {/* The covers and the money in one panel: the shape of the reference
            design, and the two things a member scans an order for. */}
        <div
          className={`mt-3 flex items-center gap-4 rounded-card p-3 ${
            order.status === "quoted" ? "bg-gold-100/60" : "bg-canvas"
          }`}
        >
          <div className="flex shrink-0 -space-x-5">
            {order.items.slice(0, 3).map((item, i) => (
              <BookCover
                key={item.id}
                src={covers.get(item.bookId)}
                title={item.title}
                size="sm"
                className={i > 0 ? "ring-2 ring-surface" : ""}
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-muted">
              {order.agreedTotal != null
                ? "Confirmed total"
                : "Estimated total"}
            </p>
            <p className="font-display text-xl text-ink tabular-nums">
              {lkr(total)}
            </p>
            {order.agreedTotal != null &&
            order.agreedTotal !== order.askingTotal ? (
              <p className="text-xs text-ink-faint line-through tabular-nums">
                {lkr(order.askingTotal)}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-2 text-sm text-ink-muted">{nextStep(order)}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={`/orders/${order.id}`}
            className={buttonClassName(open ? "primary" : "secondary", "sm")}
          >
            {order.status === "quoted"
              ? "Answer the club"
              : order.status === "agreed"
                ? "Pay now"
                : "View order"}
          </Link>
          {open ? <CancelOrderButton orderId={order.id} /> : null}
          {order.messages.length > 0 ? (
            <span className="ml-auto text-xs text-ink-faint">
              {order.messages.length} message
              {order.messages.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </Card>
    </li>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireActiveMember();
  const sp = await searchParams;
  const tab = sp.tab === "active" || sp.tab === "past" ? sp.tab : "all";

  const orders = await getMyOrders();
  const isOpen = (o: BookOrder) => OPEN_STATUSES.includes(o.status);
  const activeCount = orders.filter(isOpen).length;
  const shown = orders.filter((o) =>
    tab === "all" ? true : tab === "active" ? isOpen(o) : !isOpen(o),
  );

  // Covers from the live catalogue. Unreachable just means placeholders.
  const snapshots = await getShopSnapshots(
    orders.flatMap((o) => o.items.map((i) => i.bookId)),
  );
  const covers = new Map<number, string | null>();
  for (const [id, snap] of snapshots) covers.set(id, snap.imageUrl);

  return (
    <AppShell>
      <PageHeader
        title="My orders"
        description="The club confirms the price on every order before anything is paid."
        action={
          <Link href="/cart" className={buttonClassName("secondary", "sm")}>
            Cart
          </Link>
        }
      />

      {orders.length === 0 ? (
        <Card flush>
          <EmptyState
            title="No orders yet"
            description="Add books to your cart and send them to the club."
            action={
              <Link
                href="/books"
                className={buttonClassName("secondary", "sm")}
              >
                Browse books
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* Links, not client state: each view is a real URL. */}
          <div
            className="mb-4 inline-flex rounded-full border border-line bg-surface p-1"
            role="tablist"
            aria-label="Orders"
          >
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === "all" ? "/orders" : `/orders?tab=${t.key}`}
                role="tab"
                aria-selected={tab === t.key}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-brand-600 text-white"
                    : "text-ink-muted hover:bg-canvas-deep hover:text-ink"
                }`}
              >
                {t.label}
                {t.key === "active" && activeCount > 0 ? (
                  <span
                    className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                      tab === t.key
                        ? "bg-white/20"
                        : "bg-gold-100 text-gold-700"
                    }`}
                  >
                    {activeCount}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>

          {shown.length === 0 ? (
            <Card flush>
              <EmptyState
                compact
                title={
                  tab === "active"
                    ? "Nothing in progress"
                    : "No past orders yet"
                }
              />
            </Card>
          ) : (
            <ul className="stagger grid gap-4 md:grid-cols-2">
              {shown.map((order) => (
                <OrderCard key={order.id} order={order} covers={covers} />
              ))}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}
