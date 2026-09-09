"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice, TextareaField } from "@/components/ui/Field";
import { addToCart, placeOrder, setCartQuantity } from "./actions";

/** Add a book to the basket from the catalogue. */
export function AddToCartButton({
  book,
  inCart,
}: {
  book: { id: number; title: string; author: string };
  inCart: boolean;
}) {
  const router = useRouter();
  const [added, setAdded] = useState(inCart);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    const fd = new FormData();
    fd.set("bookId", String(book.id));
    fd.set("title", book.title);
    fd.set("author", book.author);

    startTransition(async () => {
      const result = await addToCart(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdded(true);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={add}
        disabled={pending || added}
        className={`min-h-9 inline-flex items-center rounded-lg px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
          added
            ? "bg-success-100 text-success-600"
            : "bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
        }`}
      >
        {added ? "In basket" : pending ? "Adding…" : "Buy"}
      </button>
      {error ? <span className="text-[11px] text-danger-600">{error}</span> : null}
    </span>
  );
}

/** Quantity stepper on the basket page. */
export function QuantityStepper({
  bookId,
  quantity,
}: {
  bookId: number;
  quantity: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(quantity);

  function set(next: number) {
    const clamped = Math.max(0, Math.min(20, next));
    setValue(clamped);
    startTransition(async () => {
      await setCartQuantity(bookId, clamped);
      router.refresh();
    });
  }

  const btn =
    "size-9 grid place-items-center rounded-lg border border-line text-ink-muted hover:bg-canvas disabled:opacity-50";

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={pending}
        aria-label="One fewer"
        className={btn}
      >
        −
      </button>
      <span className="w-7 text-center text-sm tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={pending || value >= 20}
        aria-label="One more"
        className={btn}
      >
        +
      </button>
      <button
        type="button"
        onClick={() => set(0)}
        disabled={pending}
        className="ml-1 text-xs text-ink-faint hover:text-danger-600"
      >
        Remove
      </button>
    </div>
  );
}

/**
 * Sends the basket to the club.
 *
 * Deliberately does NOT say "Pay now". Nothing is charged here: the order goes
 * to the club, who confirm the price first. Labelling this as a payment and
 * then not taking one is how a member ends up thinking they have bought
 * something they have not.
 */
export function PlaceOrderForm({ total }: { total: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await placeOrder(note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/orders/${result.data?.orderId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}

      <TextareaField
        label="Anything the club should know?"
        name="note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        hint="Optional — a deadline, a gift wrap, an edition you need."
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : `Send this order to the club · ${total}`}
      </Button>

      <p className="text-xs text-ink-muted text-center">
        Nothing is charged yet. The club checks the prices and comes back to you.
      </p>
    </form>
  );
}
