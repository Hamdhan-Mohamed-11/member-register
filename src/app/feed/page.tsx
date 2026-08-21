import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClassName } from "@/components/ui/Button";
import { isAdmin, requireActiveMember } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Home" };

export default async function FeedPage() {
  const member = await requireActiveMember();

  return (
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: null,
      }}
    >
      <div className="space-y-4">
        <Card>
          <CardHeader
            title={`Hello, ${member.firstName || "there"}`}
            description={member.clubName ?? "You're not in a club yet."}
          />
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-2xl font-semibold text-brand-600">
                {member.pointsBalance}
              </p>
              <p className="text-ink-muted">points</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-ink">
                {member.renewalDate
                  ? new Date(member.renewalDate).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </p>
              <p className="text-ink-muted">renews on</p>
            </div>
          </div>
        </Card>

        {isAdmin(member) ? (
          <Card>
            <CardHeader
              title="Club admin"
              description="Record sessions, attendance and points."
              action={
                <Link href="/admin" className={buttonClassName("secondary", "sm")}>
                  Open
                </Link>
              }
            />
          </Card>
        ) : null}

        <Card flush>
          <EmptyState
            title="No sessions yet"
            description="Upcoming and recent book presentations will show up here once your club starts recording them."
          />
        </Card>
      </div>
    </AppShell>
  );
}
