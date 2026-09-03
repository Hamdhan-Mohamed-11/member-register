import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, buttonClassName } from "@/components/ui/Button";
import { ProfileView } from "@/components/members/ProfileView";
import {
  activeMemberships,
  membershipState,
  requireActiveMember,
} from "@/lib/auth/session";
import { avatarUrl, getMemberProfile } from "@/lib/members/queries";

export const metadata: Metadata = { title: "My profile" };

const STATE_COPY = {
  active: { tone: "text-success-600", label: "Active" },
  expiring_soon: { tone: "text-warning-600", label: "Expiring soon" },
  expired: { tone: "text-danger-600", label: "Expired" },
  none: { tone: "text-ink-faint", label: "No renewal date" },
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
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: avatarUrl(member.userId, member.avatarPath),
      }}
    >
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
                const state = membershipState(club.renewalDate);
                const copy = STATE_COPY[state];
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
                    <span className={`text-sm font-medium shrink-0 ${copy.tone}`}>
                      {copy.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {/*
            These four are the only way in to /renew, /me/points and
            /me/videos. The bottom bar is capped at five items, so those pages
            hang off their section instead -- and until now nothing linked to
            them at all, which made them reachable only by typing the URL.
          */}
          <div className="px-4 py-3 border-t border-line flex flex-wrap gap-2">
            <Link href="/renew" className={buttonClassName("secondary", "sm")}>
              Renew or join a club
            </Link>
            <Link href="/me/points" className={buttonClassName("ghost", "sm")}>
              My points
            </Link>
            <Link href="/me/videos" className={buttonClassName("ghost", "sm")}>
              My videos
            </Link>
            <Link href="/directory" className={buttonClassName("ghost", "sm")}>
              Browse members
            </Link>
          </div>

          <div className="px-4 py-3 border-t border-line">
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
