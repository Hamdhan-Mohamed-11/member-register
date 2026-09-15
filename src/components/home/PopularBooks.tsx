import Link from "next/link";
import { BookCover } from "@/components/books/BookCover";
import type { PopularBook } from "@/lib/home/queries";

/**
 * The books most members have ordered, borrowed or wishlisted, as cover
 * cards. `href` is where a card goes -- the catalogue page for members, the
 * join page signed out (the catalogue needs an account).
 */
export function PopularBooks({
  books,
  href,
}: {
  books: PopularBook[];
  href: (book: PopularBook) => string;
}) {
  return (
    <ul className="stagger grid gap-3 sm:grid-cols-2">
      {books.map((book, i) => (
        <li key={book.bookId} className="min-w-0">
          <Link
            href={href(book)}
            className="group press flex h-full items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card transition-colors hover:border-brand-500/40"
          >
            <span className="relative shrink-0">
              <BookCover src={book.imageUrl} title={book.title} size="lg" />
              <span className="absolute -left-2 -top-2 grid size-6 place-items-center rounded-full bg-gold-500 font-display text-xs text-brand-950 shadow-card">
                {i + 1}
              </span>
            </span>
            <span className="min-w-0">
              <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:text-brand-600">
                {book.title}
              </span>
              {book.author ? (
                <span className="mt-0.5 block truncate text-xs text-ink-muted">{book.author}</span>
              ) : null}
              <span className="mt-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                {book.members} member{book.members === 1 ? "" : "s"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
