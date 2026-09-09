import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PayButton } from "@/app/renew/PayButton";
import { startBookOrderPayment } from "@/app/renew/actions";
import {
  CancelOrderButton,
  OrderThread,
  QuoteResponse,
} from "../OrderClient";
import { STATUS, formatWhen } from "../page";
import { requireActiveMember } from "@/lib/auth/session";
import { getOrder } from "@/lib/orders/queries";
import { formatLkrCents } from "@/lib/pricing";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

const lkr = (value: number) => formatLkrCents(Math.round(value * 100));

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireActiveMember();
  const { id } = await params;

  // Null covers both "no such order" and "not yours" -- RLS does not
  // distinguish them, and neither should this page.
  const order = await getOrder(id);
  if (!order) notFound();

  const open = ["review", "quoted", "agreed"].includes(order.status);

  return (
    <AppShell>
      <BackLink href="/orders">My orders</BackLink>
      <PageHeader
        className="mt-1"
        title={`${order.items.length} book${order.items.length === 1 ? "" : "s"}`}
        description={`Sent ${formatWhen(order.createdAt)}`}
        action={<Badge tone={STATUS[order.status].tone}>{STATUS[order.status].label}</Badge>}
      />

      <div className="space-y-4">
        <Card flush>
          <ul className="divide-y divide-line">
            {order.items.map((item) => {
              const unit = item.agreedUnitPrice ?? item.askingUnitPrice;
              const changed =
                item.agreedUnitPrice != null &&
                item.agreedUnitPrice !== item.askingUnitPrice;
              return (
                <li key={item.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <Link href={`/books/${item.bookId}`} className="min-w-0 group">
                    <p className="font-medium text-ink group-hover:text-brand-600">
                      {item.title || `Book #${item.bookId}`}
                    </p>
                    {item.author ? (
                      <p className="text-sm text-ink-muted truncate">{item.author}</p>
                    ) : null}
                    <p className="text-xs text-ink-faint mt-0.5">
                      {item.quantity} × {lkr(unit)}
                      {changed ? (
                        <span className="ml-1.5 line-through text-ink-faint">
                          {lkr(item.askingUnitPrice)}
                        </span>
                      ) : null}
                    </p>
                  </Link>
                  <p className="text-sm font-medium text-ink shrink-0 tabular-nums">
                    {lkr(unit * item.quantity)}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="px-4 py-3 border-t border-line flex items-baseline justify-between">
            <span className="text-sm text-ink-muted">
              {order.agreedTotal != null ? "Confirmed total" : "Estimated total"}
            </span>
            <span className="font-display text-xl text-ink tabular-nums">
              {lkr(order.agreedTotal ?? order.askingTotal)}
            </span>
          </div>
        </Card>

        {order.note ? (
          <Card>
            <CardHeader title="Your note" />
            <p className="text-sm text-ink whitespace-pre-line">{order.note}</p>
          </Card>
        ) : null}

        {order.status === "review" ? (
          <Card tone="warning">
            <p className="text-sm text-ink">
              The club is checking the prices. They&apos;ll come back to you here,
              and nothing is charged until you agree.
            </p>
          </Card>
        ) : null}

        {order.status === "quoted" ? (
          <Card tone="brand">
            <CardHeader title="The price has changed" />
            <QuoteResponse
              orderId={order.id}
              askingTotal={lkr(order.askingTotal)}
              agreedTotal={lkr(order.agreedTotal ?? order.askingTotal)}
            />
          </Card>
        ) : null}

        {order.status === "agreed" ? (
          <Card tone="brand">
            <CardHeader
              title="Ready to pay"
              description={
                order.readriseLkr > 0
                  ? `${lkr(order.readriseLkr)} of this goes to Read and Rise.`
                  : undefined
              }
            />
            <PayButton
              action={startBookOrderPayment}
              fields={{ orderId: order.id }}
              label={`Pay ${lkr(order.agreedTotal ?? 0)}`}
            />
          </Card>
        ) : null}

        {order.status === "paid" || order.status === "fulfilled" ? (
          <Card tone="brand">
            <p className="text-sm text-ink">
              Paid — thank you.{" "}
              {order.readriseLkr > 0 ? (
                <>
                  <span className="font-medium">{lkr(order.readriseLkr)}</span> of it
                  went to Read and Rise.
                </>
              ) : null}
            </p>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Messages"
            description="Anything you or the club say about this order."
          />

          {order.messages.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing yet.</p>
          ) : (
            <ul className="space-y-2">
              {order.messages.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    m.fromAdmin
                      ? "bg-canvas-deep text-ink"
                      : "bg-brand-50 text-ink ml-6"
                  }`}
                >
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {m.fromAdmin ? "The club" : "You"} · {formatWhen(m.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <OrderThread orderId={order.id} canWrite={open} />
        </Card>

        {open ? (
          <div>
            <CancelOrderButton orderId={order.id} />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
