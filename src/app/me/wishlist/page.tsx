import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClassName } from "@/components/ui/Button";
import { WishlistButton } from "@/components/books/BookActions";
import { requireActiveMember } from "@/lib/auth/session";
import { getLibraryAccess, getWishlist, type WishlistItem } from "@/lib/library/queries";

export const metadata: Metadata = { title: "Wishlist" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "buy", label: "To buy" },
  { key: "borrow", label: "To borrow" },
] as const;

function List({
  items,
  kind,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  items: WishlistItem[];
  kind: "buy" | "borrow";
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <Card flush>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </Card>
    );
  }

  return (
    <Card flush>
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3 flex items-start justify-between gap-3">
            <Link href={`/books/${item.bookId}`} className="min-w-0 group">
              <p className="font-medium text-ink truncate group-hover:text-brand-600">
                {item.title || `Book #${item.bookId}`}
              </p>
              {item.author ? (
                <p className="text-sm text-ink-muted truncate">{item.author}</p>
              ) : null}
            </Link>

            {/*
              The same toggle as on the catalogue, starting in the "saved"
              state -- so the only button on this row removes the thing the row
              is about, which is what a wishlist page is for.
            */}
            <WishlistButton
              book={{ id: item.bookId, title: item.title, author: item.author }}
              kind={kind}
              saved
              labels={{ add: "Save", added: "Remove" }}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function WishlistPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const member = await requireActiveMember();
  const sp = await searchParams;
  const tab = sp.tab === "borrow" ? "borrow" : "buy";

  const [items, access] = await Promise.all([
    getWishlist(tab),
    getLibraryAccess(member.userId),
  ]);

  return (
    <AppShell>
      <BackLink href="/me">Me</BackLink>
      <PageHeader className="mt-1" title="Wishlist" description="Books you saved for later." />

      {/* Links rather than client state, for the same reason as the
          leaderboard tabs: each list is a real, linkable URL. */}
      <div
        className="inline-flex rounded-full border border-line bg-surface p-1 mb-4"
        role="tablist"
        aria-label="Wishlist"
      >
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "buy" ? "/me/wishlist" : `/me/wishlist?tab=${t.key}`}
            role="tab"
            aria-selected={tab === t.key}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-brand-600 text-white"
                : "text-ink-muted hover:text-ink hover:bg-canvas-deep"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "borrow" && !access.active ? (
        <Card tone="warning" className="mb-3">
          <p className="text-sm text-ink">
            You can keep this list, but borrowing needs the add-on before you can
            actually request any of them.{" "}
            <Link href="/library" className="text-brand-600 font-medium hover:underline">
              See what it costs
            </Link>
            .
          </p>
        </Card>
      ) : null}

      <List
        items={items}
        kind={tab}
        emptyTitle={tab === "buy" ? "Nothing saved to buy yet" : "Nothing saved to borrow yet"}
        emptyDescription={
          tab === "buy"
            ? "Tap Wishlist on any book in the catalogue and it lands here."
            : "Tap Later on a book in the library and it lands here."
        }
        emptyAction={
          <Link
            href={tab === "buy" ? "/books" : "/library"}
            className={buttonClassName("secondary", "sm")}
          >
            {tab === "buy" ? "Browse books" : "Browse the library"}
          </Link>
        }
      />
    </AppShell>
  );
}
