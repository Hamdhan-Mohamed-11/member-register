"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice, controlClassName } from "@/components/ui/Field";
import {
  cancelOrder,
  postOrderMessage,
  respondToQuote,
} from "@/app/cart/actions";

/**
 * Accept or decline a price the club has revised.
 *
 * Declining is presented as an ordinary choice, not a warning: the club's rule
 * is that a member can walk away with no penalty when a price goes up, and
 * dressing that up in red would make a fair option feel like a mistake.
 */
export function QuoteResponse({
  orderId,
  askingTotal,
  agreedTotal,
}: {
  orderId: string;
  askingTotal: string;
  agreedTotal: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await respondToQuote(orderId, accept);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}

      <p className="text-sm text-ink">
        You asked at <span className="tabular-nums">{askingTotal}</span>. The
        club says it is actually{" "}
        <span className="font-medium tabular-nums">{agreedTotal}</span>.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => respond(true)} disabled={pending}>
          {pending ? "Saving…" : "Yes, go ahead"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => respond(false)}
          disabled={pending}
        >
          No thanks
        </Button>
      </div>

      <p className="text-xs text-ink-muted">
        Declining costs nothing and cancels the order.
      </p>
    </div>
  );
}

/**
 * Cancel an open order.
 *
 * A real button, in the danger colour, and next to the order's main action --
 * it used to be a faint grey link at the foot of the page, below the message
 * thread, and members could not find it (review item 9). Two taps, because it
 * cannot be undone: the first asks, the second does it.
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrder(orderId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.refresh();
      }
    });
  }

  const danger =
    "press inline-flex min-h-9 items-center rounded-lg border border-danger-600/40 bg-surface px-3 text-sm font-medium text-danger-600 hover:bg-danger-100 disabled:opacity-50";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className={danger}
          >
            {pending ? "Cancelling…" : "Yes, cancel it"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="min-h-9 rounded-lg px-2 text-sm text-ink-muted hover:text-ink"
          >
            Keep it
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={danger}
        >
          Cancel order
        </button>
      )}
      {error ? (
        <span className="w-full text-xs text-danger-600">{error}</span>
      ) : null}
    </span>
  );
}

/**
 * The message thread on an order.
 *
 * This is the "mode of communication" the club asked for. It hangs off the
 * order rather than being an email or a phone call, so the price conversation
 * stays attached to the thing it is about and either side can read it back.
 */
export function OrderThread({
  orderId,
  canWrite,
}: {
  orderId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) return null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      {error ? <Notice>{error}</Notice> : null}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Ask a question about this order…"
        className={controlClassName}
      />
      <Button type="submit" size="sm" disabled={pending || !body.trim()}>
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}
