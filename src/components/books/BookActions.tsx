"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelBorrowRequest,
  requestBorrow,
  toggleWishlist,
} from "@/app/library/actions";
import type { WishlistKind } from "@/lib/library/queries";

type Book = { id: number; title: string; author: string };

function baseClass(active: boolean): string {
  return `min-h-9 inline-flex items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
    active
      ? "bg-gold-100 text-gold-700 border border-gold-700/25"
      : "bg-canvas text-ink-muted border border-line hover:bg-brand-50 hover:text-brand-700"
  }`;
}

/**
 * Save a book to a wishlist, or take it off again.
 *
 * Optimistic: the label flips immediately and reverts if the server disagrees.
 * These buttons sit on a grid of forty cards and a member adds several in a
 * row, so waiting for a round trip before the button acknowledges the tap
 * makes the whole page feel broken on a slow connection.
 */
export function WishlistButton({
  book,
  kind,
  saved,
  labels,
}: {
  book: Book;
  kind: WishlistKind;
  saved: boolean;
  labels?: { add: string; added: string };
}) {
  const router = useRouter();
  const [on, setOn] = useState(saved);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const copy = labels ?? { add: "Wishlist", added: "Wishlisted" };

  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);

    const fd = new FormData();
    fd.set("bookId", String(book.id));
    fd.set("kind", kind);
    fd.set("title", book.title);
    fd.set("author", book.author);

    startTransition(async () => {
      const result = await toggleWishlist(fd);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
        return;
      }
      // Trust the server's answer over the optimistic guess -- they differ if
      // the row was already there from another tab.
      setOn(result.data?.added ?? next);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
        className={baseClass(on)}
      >
        <svg
          viewBox="0 0 24 24"
          fill={on ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5"
          aria-hidden
        >
          <path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4-6.5 4V4.5a1 1 0 0 1 1-1Z" />
        </svg>
        {on ? copy.added : copy.add}
      </button>
      {error ? <span className="text-[11px] text-danger-600">{error}</span> : null}
    </span>
  );
}

/**
 * Ask to borrow a book.
 *
 * Not optimistic, unlike the wishlist: this one can genuinely be refused --
 * the three-books-out cap, an add-on that lapsed since the page rendered --
 * and a button that says "Requested" before the server agrees would be lying
 * about something the member will act on.
 */
export function BorrowButton({
  book,
  alreadyOpen,
}: {
  book: Book;
  alreadyOpen: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requested = alreadyOpen || done;

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("bookId", String(book.id));
    fd.set("title", book.title);
    fd.set("author", book.author);

    startTransition(async () => {
      const result = await requestBorrow(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={submit}
        disabled={pending || requested}
        className={`min-h-9 inline-flex items-center rounded-lg px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
          requested
            ? "bg-success-100 text-success-600"
            : "bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
        }`}
      >
        {requested ? "Requested" : pending ? "Asking…" : "Borrow"}
      </button>
      {error ? <span className="text-[11px] text-danger-600">{error}</span> : null}
    </span>
  );
}

/** Withdraw a request nobody has acted on yet. */
export function CancelBorrowButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelBorrowRequest(id);
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
        className="min-h-9 rounded-lg border border-line px-3 text-xs font-medium text-ink-muted hover:bg-canvas disabled:opacity-50"
      >
        {pending ? "Withdrawing…" : "Withdraw"}
      </button>
      {error ? <span className="text-[11px] text-danger-600">{error}</span> : null}
    </span>
  );
}
