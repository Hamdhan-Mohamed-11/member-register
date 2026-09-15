import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { buttonClassName } from "@/components/ui/Button";
import { controlClassName } from "@/components/ui/Field";
import { BookCover } from "@/components/books/BookCover";
import { activeMemberships, requireActiveMember } from "@/lib/auth/session";
import { avatarUrl, getDirectory, type DirectoryEntry } from "@/lib/members/queries";
import { openLibraryCoverSrc } from "@/lib/books/covers";

export const metadata: Metadata = { title: "Members" };

/**
 * One member, always in the same shape (review item 19).
 *
 * Every card has the same four bands -- who, about, reading, profile link --
 * whether or not the member has filled them in. An empty band keeps its height
 * and says so, instead of collapsing, which is what made the grid ragged: a
 * card with a book on the go stood a third taller than one without.
 */
function MemberCard({ person }: { person: DirectoryEntry }) {
  const name = `${person.firstName} ${person.lastName}`.trim() || "Member";
  const href = `/members/${person.id}`;

  return (
    <li className="min-w-0">
      <Card className="flex h-full flex-col">
        <div className="flex items-start gap-3">
          <Avatar
            src={avatarUrl(person.id, person.avatarPath)}
            firstName={person.firstName}
            lastName={person.lastName}
          />
          <div className="min-w-0 flex-1">
            <Link href={href} className="block truncate font-display text-lg leading-tight text-ink hover:text-brand-600">
              {name}
            </Link>
            <p className="truncate text-xs text-ink-muted">
              {person.clubs.join(" · ") || "No club"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700 tabular-nums">
            {person.pointsBalance} pts
          </span>
        </div>

        <p
          className={`mt-3 line-clamp-2 min-h-10 text-sm ${
            person.bio ? "text-ink" : "text-ink-faint"
          }`}
        >
          {person.bio || "No introduction yet."}
        </p>

        <div className="mt-3 flex h-20 items-center gap-3 rounded-card bg-canvas px-3">
          {person.nowReading ? (
            <>
              <BookCover
                src={openLibraryCoverSrc(person.nowReading.coverId)}
                title={person.nowReading.title}
                size="sm"
              />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-700">
                  Reading now
                  {person.currentlyReading.length > 1
                    ? ` · +${person.currentlyReading.length - 1}`
                    : ""}
                </p>
                <p className="truncate text-sm font-medium text-ink">{person.nowReading.title}</p>
                {person.nowReading.author ? (
                  <p className="truncate text-xs text-ink-muted">{person.nowReading.author}</p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-faint">Not reading anything right now.</p>
          )}
        </div>

        <div className="mt-auto pt-4">
          <Link href={href} className={`${buttonClassName("secondary", "sm")} w-full`}>
            View profile
          </Link>
        </div>
      </Card>
    </li>
  );
}

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const member = await requireActiveMember();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const everyone = await getDirectory();
  const clubs = activeMemberships(member);

  // The caller's own row comes back too -- it is their directory, but seeing
  // yourself listed among "other members" reads oddly.
  const others = everyone.filter((m) => m.id !== member.userId);

  // Filtered here rather than in the query: the list is one club's worth of
  // people, already fetched, and matching on the club and the book as well as
  // the name means a member can find "whoever is reading Chinaman".
  const needle = q.toLowerCase();
  const shown = needle
    ? others.filter((m) =>
        [`${m.firstName} ${m.lastName}`, ...m.clubs, ...m.currentlyReading].some((text) =>
          text.toLowerCase().includes(needle),
        ),
      )
    : others;

  return (
    <AppShell>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl text-ink page-title">Members</h1>
          <p className="text-sm text-ink-muted">
            {clubs.length
              ? `Everyone in ${clubs.map((c) => c.clubName).join(" and ")}, and the clubs they share a type with.`
              : "Join a club to see its members."}
          </p>
        </div>
        <Link
          href="/leaderboard"
          className={`${buttonClassName("secondary", "sm")} hidden sm:inline-flex`}
        >
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
        <>
          {/* A plain GET form: works without JavaScript, and the search is in
              the URL so the back button returns to the same results. */}
          <form role="search" action="/directory" className="mb-4 flex gap-2">
            <label htmlFor="member-search" className="sr-only">
              Search members
            </label>
            <input
              id="member-search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search by name, club or book"
              className={`${controlClassName} min-w-0 flex-1`}
            />
            <button type="submit" className={buttonClassName("primary", "md")}>
              Search
            </button>
          </form>

          {q ? (
            <p className="mb-3 text-sm text-ink-muted">
              {shown.length} member{shown.length === 1 ? "" : "s"} matching &ldquo;{q}&rdquo;
              {" · "}
              <Link href="/directory" className="text-brand-600 hover:underline">
                Clear
              </Link>
            </p>
          ) : null}

          {shown.length === 0 ? (
            <Card flush>
              <EmptyState
                compact
                title="Nobody matches that"
                description="Try part of a name, a club, or a book title."
              />
            </Card>
          ) : (
            <ul className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((person) => (
                <MemberCard key={person.id} person={person} />
              ))}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}
