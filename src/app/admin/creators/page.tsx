import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireSuperAdmin } from "@/lib/auth/session";
import { listPendingBooks, listPendingCreators } from "@/lib/creators/queries";
import { bookCoverUrl } from "@/lib/creators/url";
import { formatLkrCents, toCents } from "@/lib/pricing";
import { DecideControls } from "./DecideControls";

export const metadata: Metadata = { title: "Authors and publishers" };

export default async function CreatorsPage() {
  await requireSuperAdmin();
  const [creators, books] = await Promise.all([listPendingCreators(), listPendingBooks()]);

  return (
    <AdminShell>
      <div className="mb-4">
        <BackLink href="/admin">Admin</BackLink>
        <h1 className="page-title mt-1 font-display text-2xl text-ink sm:text-3xl">
          Authors and publishers
        </h1>
        <p className="text-sm text-ink-muted">
          Who may sell through the club, and what they may sell. An approved
          book appears in the shop at once.
        </p>
      </div>

      <div className="space-y-4">
        <Card flush>
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <CardHeader
              title={`${creators.length} waiting to register`}
              description="Authors who registered themselves, and publishing houses."
            />
          </div>

          {creators.length === 0 ? (
            <EmptyState compact icon="check" title="Nobody is waiting" />
          ) : (
            <ul className="divide-y divide-line">
              {creators.map((c) => (
                <li
                  key={`${c.kind}-${c.id}`}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{c.name}</p>
                      <span className="rounded-full bg-canvas-deep px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                        {c.kind === "publisher" ? "Publisher" : "Author"}
                      </span>
                    </div>
                    {c.email ? <p className="text-sm text-ink-muted">{c.email}</p> : null}
                    {c.about ? (
                      <p className="mt-1 text-sm text-ink-muted">{c.about}</p>
                    ) : null}
                    {c.website ? (
                      <p className="mt-1 break-all text-sm text-brand-600">{c.website}</p>
                    ) : null}
                  </div>

                  <DecideControls kind={c.kind} id={c.id} what={c.name} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card flush>
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <CardHeader
              title={`${books.length} book${books.length === 1 ? "" : "s"} waiting`}
              description="Submitted for the shop."
            />
          </div>

          {books.length === 0 ? (
            <EmptyState compact icon="check" title="No books waiting" />
          ) : (
            <ul className="divide-y divide-line">
              {books.map((b) => {
                const cover = bookCoverUrl(b.coverPath);
                return (
                  <li
                    key={b.id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                  >
                    <div className="flex min-w-0 gap-3">
                      <div className="grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-canvas-deep text-center text-[11px] text-ink-faint">
                        {cover ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={cover} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="px-1">No cover</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{b.title}</p>
                        <p className="text-sm text-ink-muted">
                          {b.authorName}
                          {b.publisherName ? ` · ${b.publisherName}` : ""}
                        </p>
                        <p className="mt-0.5 text-sm text-ink">
                          {formatLkrCents(toCents(b.priceLkr))}
                          {b.isbn ? ` · ISBN ${b.isbn}` : ""}
                        </p>
                        {b.blurb ? (
                          <p className="mt-1 line-clamp-4 text-sm text-ink-muted">{b.blurb}</p>
                        ) : null}
                      </div>
                    </div>

                    <DecideControls kind="book" id={String(b.id)} what={b.title} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
