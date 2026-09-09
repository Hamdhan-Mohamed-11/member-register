import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSecretary } from "@/lib/auth/session";
import { getAllOrders, type BookOrder, type OrderStatus } from "@/lib/orders/queries";
import { AdminReply, FulfilButton, OrderReview } from "./OrderReview";

export const metadata: Metadata = { title: "Book orders" };
export const dynamic = "force-dynamic";

const STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  review: { label: "Needs a price", tone: "warning" },
  quoted: { label: "Waiting on member", tone: "brand" },
  agreed: { label: "Awaiting payment", tone: "neutral" },
  paid: { label: "Paid — hand it over", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  fulfilled: { label: "Collected", tone: "neutral" },
};

const lkr = (n: number) =>
  `LKR ${n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function when(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function OrderCard({ order }: { order: BookOrder }) {
  const total = order.agreedTotal ?? order.askingTotal;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {order.memberName || order.memberEmail || "A member"}
          </p>
          <p className="text-xs text-ink-faint">
            {when(order.createdAt)} · {order.items.length} book
            {order.items.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <Badge tone={STATUS[order.status].tone}>{STATUS[order.status].label}</Badge>
          <p className="mt-1 text-sm font-medium text-ink tabular-nums">{lkr(total)}</p>
          {order.readriseLkr > 0 ? (
            <p className="text-[11px] text-brand-600">
              {lkr(order.readriseLkr)} to Read and Rise
            </p>
          ) : null}
        </div>
      </div>

      {order.note ? (
        <p className="mt-2 rounded-lg bg-canvas-deep px-3 py-2 text-sm text-ink">
          <span className="text-ink-faint">Their note: </span>
          {order.note}
        </p>
      ) : null}

      <ul className="mt-2 space-y-0.5">
        {order.items.map((i) => (
          <li key={i.id} className="text-sm text-ink-muted">
            <Link href={`/books/${i.bookId}`} className="hover:text-brand-600">
              {i.title || `Book #${i.bookId}`}
            </Link>
            <span className="text-ink-faint">
              {" "}
              × {i.quantity} · {lkr(i.agreedUnitPrice ?? i.askingUnitPrice)}
            </span>
          </li>
        ))}
      </ul>

      {order.messages.length ? (
        <ul className="mt-3 space-y-1.5">
          {order.messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                m.fromAdmin ? "bg-brand-50 text-ink ml-6" : "bg-canvas-deep text-ink"
              }`}
            >
              <p className="whitespace-pre-line">{m.body}</p>
              <p className="mt-1 text-[11px] text-ink-faint">
                {m.fromAdmin ? "You" : "The member"} · {when(m.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <OrderReview orderId={order.id} items={order.items} status={order.status} />

      {order.status === "paid" ? (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <FulfilButton orderId={order.id} />
          <AdminReply orderId={order.id} />
        </div>
      ) : null}

      {order.status === "agreed" ? (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">
            Price agreed. Waiting for the member to pay.
          </p>
          <AdminReply orderId={order.id} />
        </div>
      ) : null}
    </Card>
  );
}

export default async function AdminOrdersPage() {
  await requireSecretary();
  const all = await getAllOrders();

  const needsYou = all.filter((o) => o.status === "review");
  const waiting = all.filter((o) => o.status === "quoted" || o.status === "agreed");
  const toHandOver = all.filter((o) => o.status === "paid");
  const done = all.filter((o) =>
    ["fulfilled", "declined", "cancelled"].includes(o.status),
  );

  return (
    <AppShell>
      <BackLink href="/admin">Admin</BackLink>
      <PageHeader
        className="mt-1"
        title="Book orders"
        description="Confirm the price on each order, or say what it really is. Nothing is charged until the member agrees."
      />

      {all.length === 0 ? (
        <Card flush>
          <EmptyState
            title="No orders yet"
            description="Orders appear here the moment a member sends their basket."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {[
            { title: "Needs a price from you", rows: needsYou },
            { title: "Paid — hand these over", rows: toHandOver },
            { title: "With the member", rows: waiting },
            { title: "Finished", rows: done },
          ].map(({ title, rows }) =>
            rows.length ? (
              <div key={title}>
                <h2 className="font-display text-lg text-ink mb-2">
                  {title} <span className="text-ink-faint text-sm">({rows.length})</span>
                </h2>
                <div className="space-y-3">
                  {rows.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </AppShell>
  );
}
