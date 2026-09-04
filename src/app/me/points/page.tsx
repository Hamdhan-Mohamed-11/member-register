import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireActiveMember } from "@/lib/auth/session";
import { myActivities } from "@/lib/sessions/queries";

export const metadata: Metadata = { title: "My points" };

export default async function MyPointsPage() {
  const member = await requireActiveMember();
  const activities = await myActivities(member.userId);

  const ledgerTotal = activities.reduce((sum, a) => sum + a.points, 0);

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/me">My profile</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">My points</h1>
      </div>

      <div className="space-y-4">
        <Card>
          <p className="text-3xl font-semibold text-brand-600">
            {member.pointsBalance}
          </p>
          <p className="text-sm text-ink-muted">points earned so far</p>

          {/*
            The balance is a cached column; this list is the underlying ledger.
            Showing a mismatch rather than hiding it means a drift bug surfaces
            to whoever noticed their points looked wrong, instead of silently
            persisting.
          */}
          {ledgerTotal !== member.pointsBalance ? (
            <p className="mt-2 text-xs text-danger-600">
              This doesn&apos;t match the {ledgerTotal} points listed below.
              Please tell a club admin.
            </p>
          ) : null}
        </Card>

        <Card flush>
          <div className="p-4 pb-2">
            <CardHeader
              title="How you earned them"
              description="Recorded by your club secretary at each session."
            />
          </div>

          {activities.length === 0 ? (
            <EmptyState
              title="No points yet"
              description="You'll earn points for attending sessions and presenting books."
            />
          ) : (
            <ul className="divide-y divide-line">
              {activities.map((entry) => (
                <li
                  key={entry.id}
                  className="px-4 py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{entry.label}</p>
                    {entry.session ? (
                      <Link
                        href={`/sessions/${entry.session.id}`}
                        className="text-sm text-brand-600 hover:underline"
                      >
                        {entry.session.title}
                      </Link>
                    ) : null}
                    <p className="text-xs text-ink-faint mt-0.5">
                      {new Date(entry.recordedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-brand-600">
                    +{entry.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
