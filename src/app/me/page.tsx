import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { AccountList } from "@/components/shell/AccountList";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ProfileView } from "@/components/members/ProfileView";
import {
  activeMemberships,
  isAdmin,
  membershipState,
  requireActiveMember,
} from "@/lib/auth/session";
import { getMemberProfile } from "@/lib/members/queries";

export const metadata: Metadata = { title: "My profile" };

const STATE_COPY = {
  active: {
    label: "Active",
    className: "bg-success-100 text-success-600",
  },
  expiring_soon: {
    label: "Expiring soon",
    className: "bg-warning-100 text-warning-600",
  },
  expired: {
    label: "Expired",
    className: "bg-danger-100 text-danger-600",
  },
  none: {
    label: "No renewal date",
    className: "bg-canvas-deep text-ink-faint",
  },
} as const;

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function MyProfilePage() {
  const member = await requireActiveMember();
  const profile = await getMemberProfile(member.userId);
  if (!profile) notFound();

  const clubs = activeMemberships(member);

  return (
    <AppShell>
      <div className="space-y-4">
        <ProfileView profile={profile} isSelf />

        <Card flush>
          <div className="p-4 pb-2">
            <CardHeader
              title="Club memberships"
              description="Each club renews on its own date."
            />
          </div>

          {clubs.length === 0 ? (
            <div className="px-4 pb-4">
              <p className="text-sm text-ink-muted">
                You&apos;re not in any club at the moment.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {clubs.map((club) => {
                const copy = STATE_COPY[membershipState(club.renewalDate)];
                return (
                  <li
                    key={club.membershipId}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">
                        {club.clubName}
                        {club.isPrimary ? (
                          <span className="ml-2 text-xs text-ink-faint">primary</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {club.renewalDate
                          ? `Renews ${formatDate(club.renewalDate)}`
                          : "No renewal date"}
                      </p>
                    </div>
                    {/*
                      A pill rather than coloured text. Colour alone carried the
                      whole status, which leaves nothing for anyone who cannot
                      separate the green from the red -- the shape and the
                      background now say "status" before the colour says which.
                    */}
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${copy.className}`}
                    >
                      {copy.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/*
          Points, videos, renewal and the members directory used to be a loose
          row of small buttons wedged under the memberships list, where a link
          styled as a button sat next to a real one and nothing indicated which
          were navigation. They are a proper list now, and the same items are
          also in the avatar menu on every page.
        */}
        <Card flush>
          <div className="px-4 pt-4 pb-1">
            <CardHeader title="Your account" />
          </div>
          <AccountList
            isAdmin={isAdmin(member)}
            pointsBalance={member.pointsBalance}
          />
        </Card>

        <Card flush>
          <form action="/auth/signout" method="post" className="p-2">
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start text-danger-600 hover:bg-danger-100 hover:text-danger-600"
            >
              <Icon name="power" className="size-[18px]" />
              Sign out
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
