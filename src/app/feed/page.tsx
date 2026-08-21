import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClassName } from "@/components/ui/Button";
import {
  activeMemberships,
  isAdmin,
  membershipState,
  nextRenewalDate,
  requireActiveMember,
} from "@/lib/auth/session";

export const metadata: Metadata = { title: "Home" };

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function FeedPage() {
  const member = await requireActiveMember();
  const clubs = activeMemberships(member);
  const renewal = nextRenewalDate(member);
  const state = membershipState(renewal);

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
            description={
              clubs.length
                ? clubs.map((c) => c.clubName).join(" · ")
                : "You're not in a club yet."
            }
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
                {renewal ? formatDate(renewal) : "—"}
              </p>
              <p className="text-ink-muted">
                {clubs.length > 1 ? "next renewal" : "renews on"}
              </p>
            </div>
          </div>
        </Card>

        {state === "expired" || state === "expiring_soon" ? (
          <Card>
            <CardHeader
              title={
                state === "expired"
                  ? "A club membership has expired"
                  : "A club membership is expiring soon"
              }
              description="Each club renews on its own date."
              action={
                <Link href="/renew" className={buttonClassName("primary", "sm")}>
                  Renew
                </Link>
              }
            />
          </Card>
        ) : null}

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
            description="Sessions from the clubs you belong to will show up here, along with paid sessions from other clubs you can book."
          />
        </Card>
      </div>
    </AppShell>
  );
}
