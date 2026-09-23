import type { Metadata } from "next";
import Link from "next/link";
import { CreatorShell } from "@/components/creator/CreatorShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClassName } from "@/components/ui/Button";
import { requireCreator } from "@/lib/auth/session";
import { listMyAuthors } from "@/lib/creators/queries";
import { SubmitBookForm } from "./SubmitBookForm";

export const metadata: Metadata = { title: "Submit a book" };

export default async function NewBookPage() {
  const session = await requireCreator();
  const authors = await listMyAuthors();

  // Only an approved name can carry a book. An author waiting on their own
  // approval sees why rather than a form that would be refused.
  const usable = authors.filter((a) => a.status === "approved");

  return (
    <CreatorShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <h1 className="page-title font-display text-2xl text-ink sm:text-3xl">
            Submit a book
          </h1>
          <p className="text-sm text-ink-muted">
            A Pick a Book admin reviews it before members can buy it.
          </p>
        </div>

        <Card>
          {usable.length === 0 ? (
            <EmptyState
              compact
              icon="clock"
              title={
                authors.length === 0
                  ? "No authors yet"
                  : "Your author account is still being reviewed"
              }
              description={
                session.role === "publisher"
                  ? "Add an author to your list first, then submit their books."
                  : "You can submit books as soon as a Pick a Book admin approves your account."
              }
              action={
                session.role === "publisher" ? (
                  <Link href="/creator/authors" className={buttonClassName("primary", "md")}>
                    My authors
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <SubmitBookForm
              authors={usable.map((a) => ({ id: a.id, name: a.name }))}
              userId={session.userId}
            />
          )}
        </Card>
      </div>
    </CreatorShell>
  );
}
