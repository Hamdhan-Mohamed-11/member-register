import type { BadgeTone } from "@/components/ui/Badge";
import type { OrderStatus } from "@/lib/orders/queries";

export const STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  review: { label: "With the club", tone: "warning" },
  quoted: { label: "Needs your answer", tone: "brand" },
  agreed: { label: "Ready to pay", tone: "success" },
  paid: { label: "Paid", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  fulfilled: { label: "Collected", tone: "neutral" },
};

/** The ones a member can still act on, and cancel. */
export const OPEN_STATUSES: OrderStatus[] = ["review", "quoted", "agreed"];

export function formatWhen(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * A short, readable reference for an order: the first stretch of its uuid.
 * Enough to tell orders apart when a member and the club are talking about
 * one, without printing 36 characters of hex.
 */
export function orderRef(id: string): string {
  return `#${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
