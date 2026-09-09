import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClassName } from "@/components/ui/Button";
import { requireActiveMember } from "@/lib/auth/session";
import { getMyOrders, type OrderStatus } from "@/lib/orders/queries";
import { formatLkrCents } from "@/lib/pricing";

export const metadata: Metadata = { title: "My orders" };
export const dynamic = "force-dynamic";

export const STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  review: { label: "With the club", tone: "warning" },
  quoted: { label: "Needs your answer", tone: "brand" },
  agreed: { label: "Ready to pay", tone: "success" },
  paid: { label: "Paid", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  fulfilled: { label: "Collected", tone: "neutral" },
};

export function formatWhen(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function OrdersPage() {
  await requireActiveMember();
  const orders = await getMyOrders();

  return (
    <AppShell>
      <PageHeader
        title="My orders"
        description="The club confirms the price on every order before anything is paid."
        action={
          <Link href="/cart" className={buttonClassName("secondary", "sm")}>
            Basket
          </Link>
        }
      />

      {orders.length === 0 ? (
        <Card flush>
          <EmptyState
            title="No orders yet"
            description="Add books to your basket and send them to the club."
            action={
              <Link href="/books" className={buttonClassName("secondary", "sm")}>
                Browse books
              </Link>
            }
          />
        </Card>
      ) : (
        <Card flush>
          <ul className="divide-y divide-line">
            {orders.map((order) => {
              const total =
                order.agreedTotal ?? order.askingTotal;
              return (
                <li key={order.id}>
                  <Link
                    href={`/orders/${order.id}`}
                    className="block px-4 py-3 hover:bg-canvas-deep transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {order.items.length} book
                          {order.items.length === 1 ? "" : "s"}
                        </p>
                        <p className="text-sm text-ink-muted truncate">
                          {order.items.map((i) => i.title).join(", ") || "—"}
                        </p>
                        <p className="text-xs text-ink-faint mt-1">
                          {formatWhen(order.createdAt)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge tone={STATUS[order.status].tone}>
                          {STATUS[order.status].label}
                        </Badge>
                        <p className="mt-1 text-sm font-medium text-ink tabular-nums">
                          {formatLkrCents(Math.round(total * 100))}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
