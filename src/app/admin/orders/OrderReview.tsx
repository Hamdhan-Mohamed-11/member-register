"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice, controlClassName } from "@/components/ui/Field";
import { markOrderFulfilled, setOrderPrice } from "./actions";
import { postOrderMessage } from "@/app/cart/actions";
import type { OrderItem } from "@/lib/orders/queries";

const lkr = (n: number) =>
  `LKR ${n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The club's answer to an order: confirm the prices, or correct them.
 *
 * Every line starts filled in with what the member was quoted, so the common
 * case -- "these are right" -- is one button press with nothing typed. Only
 * the lines actually changed get sent, which is also what makes "accept as-is"
 * distinguishable from "re-state the same numbers" in the audit trail.
 */
export function OrderReview({
  orderId,
  items,
  status,
}: {
  orderId: string;
  items: OrderItem[];
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, String(i.agreedUnitPrice ?? i.askingUnitPrice)]),
    ),
  );

  const changed = items.filter(
    (i) => Number(prices[i.id]) !== (i.agreedUnitPrice ?? i.askingUnitPrice),
  );
  const total = items.reduce(
    (sum, i) => sum + (Number(prices[i.id]) || 0) * i.quantity,
    0,
  );
  const raised = items.some(
    (i) => (Number(prices[i.id]) || 0) > i.askingUnitPrice,
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await setOrderPrice({
        orderId,
        prices: changed.map((i) => ({
          item_id: i.id,
          unit_price: Number(prices[i.id]) || 0,
        })),
        message: message.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("");
      router.refresh();
    });
  }

  if (status !== "review" && status !== "quoted") return null;

  return (
    <div className="mt-3 border-t border-line pt-3 space-y-3">
      {error ? <Notice>{error}</Notice> : null}

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-sm text-ink truncate">
              {item.title || `Book #${item.bookId}`}
              <span className="text-ink-faint"> × {item.quantity}</span>
            </span>
            <span className="text-xs text-ink-faint shrink-0 tabular-nums">
              asked {lkr(item.askingUnitPrice)}
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={prices[item.id] ?? ""}
              onChange={(e) =>
                setPrices((p) => ({ ...p, [item.id]: e.target.value }))
              }
              aria-label={`Unit price for ${item.title}`}
              className={`${controlClassName} w-28 shrink-0`}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-muted">New total</span>
        <span className="font-medium text-ink tabular-nums">{lkr(total)}</span>
      </div>

      {raised ? (
        <Notice tone="info">
          One or more prices went up, so the member will be asked to confirm
          before paying. Say why in the message below.
        </Notice>
      ) : null}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder={
          raised
            ? "e.g. This edition is Rs. 2,400 — would you still like to go ahead?"
            : "Optional message to the member"
        }
        className={controlClassName}
      />

      <Button onClick={submit} disabled={pending}>
        {pending
          ? "Saving…"
          : changed.length === 0
            ? "Confirm these prices"
            : raised
              ? "Send the new price"
              : "Save the corrected price"}
      </Button>
    </div>
  );
}

export function FulfilButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await markOrderFulfilled(orderId);
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
        className="min-h-9 rounded-lg bg-success-100 px-3 text-xs font-medium text-success-600 hover:bg-success-100/70 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark handed over"}
      </button>
      {error ? <span className="text-[11px] text-danger-600">{error}</span> : null}
    </span>
  );
}

/** Reply to a member on an order that is already settled. */
export function AdminReply({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await postOrderMessage(orderId, body);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setBody("");
          router.refresh();
        });
      }}
      className="mt-2 space-y-2"
    >
      {error ? <Notice>{error}</Notice> : null}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Reply to the member…"
        className={controlClassName}
      />
      <Button type="submit" size="sm" disabled={pending || !body.trim()}>
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}
