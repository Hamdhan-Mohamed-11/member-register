import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { requireSuperAdmin } from "@/lib/auth/session";
import { listShelf } from "@/lib/library/shelf";
import { ShelfManager } from "./ShelfManager";

export const metadata: Metadata = { title: "The lending shelf" };
export const dynamic = "force-dynamic";

export default async function ShelfPage() {
  const admin = await requireSuperAdmin();
  // Retired books included: this is the screen where you put one back.
  const books = await listShelf({ all: true });
  const categories = [...new Set(books.map((b) => b.category).filter(Boolean))] as string[];

  return (
    <AdminShell>
      <div className="mb-4">
        <BackLink href="/admin/library">Borrow requests</BackLink>
        <h1 className="page-title mt-1 font-display text-2xl text-ink sm:text-3xl">
          The lending shelf
        </h1>
        <p className="text-sm text-ink-muted">
          The books the club lends. These are the club&apos;s own copies — the
          shop catalogue has nothing to do with them.
        </p>
      </div>

      <ShelfManager
        books={books}
        categories={categories.sort((a, b) => a.localeCompare(b))}
        userId={admin.userId}
      />
    </AdminShell>
  );
}
