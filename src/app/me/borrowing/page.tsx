import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClassName } from "@/components/ui/Button";
import { CancelBorrowButton } from "@/components/books/BookActions";
import { requireActiveMember } from "@/lib/auth/session";
import { getLibraryAccess, getMyBorrowRequests, type BorrowStatus } from "@/lib/library/queries";

export const metadata: Metadata = { title: "My borrowing" };
export const dynamic = "force-dynamic";

const STATUS: Record<BorrowStatus, { label: string; tone: BadgeTone }> = {
  requested: { label: "Waiting for approval", tone: "neutral" },
  approved: { label: "Approved — collect it", tone: "brand" },
  issued: { label: "With you", tone: "success" },
  returned: { label: "Returned", tone: "neutral" },
  rejected: { label: "Declined", tone: "danger" },
  cancelled: { label: "Withdrawn", tone: "neutral" },
};

function formatDate(value: string): string {
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  );
}

export default async function BorrowingPage() {
  const member = await requireActiveMember();
  const [requests, access] = await Promise.all([
    getMyBorrowRequests(),
    getLibraryAccess(member.userId),
  ]);

  const open = requests.filter((r) => ["requested", "approved", "issued"].includes(r.status));
  const past = requests.filter((r) => !["requested", "approved", "issued"].includes(r.status));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell>
      <BackLink href="/me">Me</BackLink>
      <PageHeader
        className="mt-1"
        title="My borrowing"
        description={
          access.active && access.expiresOn
            ? `Borrowing until ${formatDate(access.expiresOn)}. Up to three books at a time.`
            : "Borrowing needs the library add-on."
        }
        action={
          <Link href="/library" className={buttonClassName("secondary", "sm")}>
            {access.active ? "Browse the library" : "Get borrowing"}
          </Link>
        }
      />

      {requests.length === 0 ? (
        <Card flush>
          <EmptyState
            title="You haven't borrowed anything yet"
            description={
              access.active
                ? "Find something in the library and tap Borrow."
                : "Add borrowing to your membership and the library opens up."
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {open.length ? (
            <Card flush>
              <ul className="divide-y divide-line">
                {open.map((r) => {
                  const overdue =
                    r.status === "issued" && r.dueOn != null && r.dueOn < today;
                  return (
                    <li key={r.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/books/${r.bookId}`} className="min-w-0 group">
                          <p className="font-medium text-ink truncate group-hover:text-brand-600">
                            {r.title || `Book #${r.bookId}`}
                          </p>
                          {r.author ? (
                            <p className="text-sm text-ink-muted truncate">{r.author}</p>
                          ) : null}
                        </Link>
                        {r.status === "requested" ? <CancelBorrowButton id={r.id} /> : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone={overdue ? "danger" : STATUS[r.status].tone}>
                          {overdue ? "Overdue" : STATUS[r.status].label}
                        </Badge>
                        {r.dueOn && r.status === "issued" ? (
                          <span className="text-xs text-ink-muted">
                            Due back {formatDate(r.dueOn)}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-faint">
                            Asked {formatDate(r.requestedAt)}
                          </span>
                        )}
                      </div>

                      {r.note ? (
                        <p className="mt-1.5 text-sm text-ink-muted">{r.note}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {past.length ? (
            <div>
              <h2 className="font-display text-lg text-ink mb-2">Earlier</h2>
              <Card flush>
                <ul className="divide-y divide-line">
                  {past.map((r) => (
                    <li
                      key={r.id}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-ink truncate">
                          {r.title || `Book #${r.bookId}`}
                        </p>
                        <p className="text-xs text-ink-faint">
                          {r.returnedAt
                            ? `Returned ${formatDate(r.returnedAt)}`
                            : formatDate(r.requestedAt)}
                        </p>
                      </div>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
