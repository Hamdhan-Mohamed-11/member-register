import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
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
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: avatarUrl(member.userId, member.avatarPath),
      }}
    >
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-ink">Members</h1>
        <p className="text-sm text-ink-muted">
          {clubs.length
            ? `Everyone in ${clubs.map((c) => c.clubName).join(" and ")}.`
            : "Join a club to see its members."}
        </p>
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
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((person) => {
            const name = `${person.firstName} ${person.lastName}`.trim() || "Member";
            return (
              <Link key={person.id} href={`/members/${person.id}`} className="block">
                <Card className="h-full hover:shadow-raised transition-shadow">
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={avatarUrl(person.id, person.avatarPath)}
                      firstName={person.firstName}
                      lastName={person.lastName}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">{name}</p>
                      <p className="text-xs text-ink-muted truncate">
                        {person.clubs.join(" · ") || "No club"}
                      </p>
                      {person.currentlyReading.length ? (
                        <p className="text-sm text-ink-muted mt-1 truncate">
                          Reading{" "}
                          <span className="text-ink">
                            {person.currentlyReading[0]}
                          </span>
                          {person.currentlyReading.length > 1
                            ? ` +${person.currentlyReading.length - 1}`
                            : ""}
                        </p>
                      ) : null}
                      <p className="text-xs text-brand-600 font-medium mt-1">
                        {person.pointsBalance} points
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
