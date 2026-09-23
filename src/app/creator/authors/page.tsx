import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreatorShell } from "@/components/creator/CreatorShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Field";
import { requireCreator } from "@/lib/auth/session";
import { getCreatorAccount, listMyAuthors } from "@/lib/creators/queries";
import { AddAuthorForm } from "./AddAuthorForm";

export const metadata: Metadata = { title: "My authors" };

export default async function AuthorsPage() {
  const session = await requireCreator();
  // An author has no list: their own name is the whole of it.
  if (session.role !== "publisher") redirect("/creator");

  const [account, authors] = await Promise.all([getCreatorAccount(), listMyAuthors()]);
  const approved = account?.status === "approved";

  return (
    <CreatorShell>
      <div className="mb-4">
        <h1 className="page-title font-display text-2xl text-ink sm:text-3xl">My authors</h1>
        <p className="text-sm text-ink-muted">
          The names you publish. You submit books on their behalf.
        </p>
      </div>

      {!approved ? (
        <div className="mb-4">
          <Notice tone="info">
            You can add authors once a Pick a Book admin has approved your
            publisher account.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card flush>
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <CardHeader title={`${authors.length} author${authors.length === 1 ? "" : "s"}`} />
          </div>

          {authors.length === 0 ? (
            <EmptyState
              compact
              icon="users"
              title="No authors yet"
              description="Add the first name on your list."
            />
          ) : (
            <ul className="divide-y divide-line">
              {authors.map((author) => (
                <li key={author.id} className="px-4 py-3 sm:px-5">
                  <p className="font-medium text-ink">{author.name}</p>
                  {author.bio ? (
                    <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{author.bio}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-faint">
                    {author.hasOwnLogin
                      ? "Signs in for themselves"
                      : "Listed by you"}
                    {author.status === "approved" ? "" : ` · ${author.status}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Add an author" description="They do not need an account." />
          <AddAuthorForm disabled={!approved} />
        </Card>
      </div>
    </CreatorShell>
  );
}
