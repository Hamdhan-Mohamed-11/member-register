import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSecretary } from "@/lib/auth/session";
import {
  getAllBorrowRequests,
  type AdminBorrowRequest,
  type BorrowStatus,
} from "@/lib/library/queries";
import { BorrowActions } from "./BorrowActions";

export const metadata: Metadata = { title: "Borrow requests" };
export const dynamic = "force-dynamic";

const STATUS: Record<BorrowStatus, { label: string; tone: BadgeTone }> = {
  requested: { label: "Waiting", tone: "warning" },
  approved: { label: "Approved", tone: "brand" },
  issued: { label: "Out", tone: "success" },
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

function Section({
  title,
  rows,
  showActions = true,
  today,
}: {
  title: string;
  rows: AdminBorrowRequest[];
  showActions?: boolean;
  today: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h2 className="font-display text-lg text-ink mb-2">
        {title} <span className="text-ink-faint text-sm">({rows.length})</span>
      </h2>
      <Card flush>
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const isOverdue =
              r.status === "issued" && r.dueOn != null && r.dueOn < today;
            return (
              <li
                key={r.id}
                className="px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/books/${r.bookId}`}
                    className="font-medium text-ink hover:text-brand-600"
                  >
                    {r.title || `Book #${r.bookId}`}
                  </Link>
                  {r.author ? (
                    <p className="text-sm text-ink-muted truncate">{r.author}</p>
                  ) : null}

                  <p className="text-sm text-ink-muted mt-1">
                    {r.member ? (
                      <Link
                        href={`/admin/members/${r.member.id}`}
                        className="hover:underline"
                      >
                        {`${r.member.firstName} ${r.member.lastName}`.trim() ||
                          r.member.email}
                      </Link>
                    ) : (
                      "Member removed"
                    )}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge tone={isOverdue ? "danger" : STATUS[r.status].tone}>
                      {isOverdue ? "Overdue" : STATUS[r.status].label}
                    </Badge>
                    <span className="text-xs text-ink-faint">
                      Asked {formatDate(r.requestedAt)}
                      {r.dueOn && r.status === "issued"
                        ? ` · due ${formatDate(r.dueOn)}`
                        : ""}
                    </span>
                  </div>
                </div>

                {showActions ? (
                  <BorrowActions id={r.id} status={r.status} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

export default async function AdminLibraryPage() {
  await requireSecretary();
  const all = await getAllBorrowRequests();

  const today = new Date().toISOString().slice(0, 10);

  // Waiting first, then out, then everything settled. A queue sorted purely by
  // date buries the one thing needing a decision under last month's returns.
  const waiting = all.filter((r) => r.status === "requested");
  const active = all.filter((r) => r.status === "approved" || r.status === "issued");
  const done = all.filter((r) =>
    ["returned", "rejected", "cancelled"].includes(r.status),
  );

  const overdue = active.filter(
    (r) => r.status === "issued" && r.dueOn != null && r.dueOn < today,
  );

  return (
    <AppShell>
      <BackLink href="/admin">Admin</BackLink>
      <PageHeader
        className="mt-1"
        title="Borrow requests"
        description="Approve a request, hand the book over, and take it back."
      />

      {overdue.length ? (
        <Card tone="danger" className="mb-4">
          <p className="text-sm text-ink">
            <span className="font-medium">
              {overdue.length} book{overdue.length === 1 ? " is" : "s are"} overdue.
            </span>{" "}
            They are marked below.
          </p>
        </Card>
      ) : null}

      {all.length === 0 ? (
        <Card flush>
          <EmptyState
            title="No borrow requests yet"
            description="Members with the library add-on can ask to borrow from /library."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <Section title="Waiting for you" rows={waiting} today={today} />
          <Section title="Approved and out" rows={active} today={today} />
          <Section title="Finished" rows={done} showActions={false} today={today} />
        </div>
      )}
    </AppShell>
  );
}
