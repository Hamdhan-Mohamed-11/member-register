import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { buttonClassName } from "@/components/ui/Button";
import { activeMemberships, requireActiveMember } from "@/lib/auth/session";
import { avatarUrl, getDirectory } from "@/lib/members/queries";

export const metadata: Metadata = { title: "Members" };

export default async function DirectoryPage() {
  const member = await requireActiveMember();
  const everyone = await getDirectory();
  const clubs = activeMemberships(member);

  // The caller's own row comes back too -- it is their directory, but seeing
  // yourself listed among "other members" reads oddly.
  const others = everyone.filter((m) => m.id !== member.userId);

  return (
    <AppShell>
      {/*
        The leaderboard ranks exactly these people, so it belongs beside them
        rather than only in the account menu. The bottom nav is full at five
        items, which is why /leaderboard is a Members sub-page and not a sixth.
      */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl text-ink page-title">Members</h1>
          <p className="text-sm text-ink-muted">
            {clubs.length
              ? `Everyone in ${clubs.map((c) => c.clubName).join(" and ")}, and the clubs they share a type with.`
              : "Join a club to see its members."}
          </p>
        </div>
        <Link href="/leaderboard" className={buttonClassName("secondary", "sm")}>
          Leaderboard
        </Link>
      </div>

      {others.length === 0 ? (
        <Card flush>
          <EmptyState
            title={clubs.length ? "No one else here yet" : "You're not in a club"}
            description={
              clubs.length
                ? "You'll see other members as they join your club."
                : "Your club memberships have lapsed, so there's nobody to show. Renew to see your club again."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {others.map((person) => {
            const name = `${person.firstName} ${person.lastName}`.trim() || "Member";
            return (
              <Link key={person.id} href={`/members/${person.id}`} className="press block min-w-0">
                <Card interactive className="h-full" flush>
                  <div className="flex items-start gap-3 p-4">
                    <Avatar
                      src={avatarUrl(person.id, person.avatarPath)}
                      firstName={person.firstName}
                      lastName={person.lastName}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{name}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {person.clubs.join(" · ") || "No club"}
                      </p>

                      {/*
                        What someone is reading is the reason to open their
                        profile, so it gets a tinted strip of its own rather
                        than a third line of grey text that reads as metadata.
                      */}
                      {person.currentlyReading.length ? (
                        <p className="mt-2 truncate rounded-lg bg-sky-100 px-2 py-1 text-xs text-sky-800">
                          {person.currentlyReading[0]}
                          {person.currentlyReading.length > 1
                            ? ` +${person.currentlyReading.length - 1}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* The points sit on their own footer rule, so the card has
                      a bottom edge and every card in the grid lines up. */}
                  <p className="border-t border-line px-4 py-2 text-xs font-medium text-brand-600">
                    {person.pointsBalance} point
                    {person.pointsBalance === 1 ? "" : "s"}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
