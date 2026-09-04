import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClassName } from "@/components/ui/Button";
import { avatarUrl, type MemberProfile } from "@/lib/members/queries";

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One profile layout for both /me and /members/[id]. `isSelf` adds the edit
 * affordances and the email; everything else is identical, so the two views
 * cannot drift into showing different things about the same person.
 */
export function ProfileView({
  profile,
  isSelf = false,
}: {
  profile: MemberProfile;
  isSelf?: boolean;
}) {
  const name = `${profile.firstName} ${profile.lastName}`.trim() || "Member";
  const reading = profile.reading.filter((r) => r.status === "reading");
  const read = profile.reading.filter((r) => r.status === "read");

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-4">
          <Avatar
            src={avatarUrl(profile.id, profile.avatarPath)}
            firstName={profile.firstName}
            lastName={profile.lastName}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl text-ink">{name}</h1>
            {isSelf ? (
              <p className="text-sm text-ink-muted truncate">{profile.email}</p>
            ) : null}

            {profile.clubs.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.clubs.map((club) => (
                  <Badge key={club.id} tone="brand">
                    {club.name}
                  </Badge>
                ))}
              </div>
            ) : null}

            {/*
              On your own profile the points total links to the ledger. It was
              already styled like a link and was not one, which reads as a
              broken control. On someone else's profile it stays plain text --
              their ledger is not yours to read.
            */}
            <p className="text-xs text-ink-faint mt-2">
              Member since {formatDate(profile.joinedOn)} ·{" "}
              {isSelf ? (
                <Link
                  href="/me/points"
                  className="text-brand-600 font-medium hover:underline"
                >
                  {profile.pointsBalance} points
                </Link>
              ) : (
                <span className="text-brand-600 font-medium">
                  {profile.pointsBalance} points
                </span>
              )}
            </p>
          </div>

          {isSelf ? (
            <Link href="/me/edit" className={buttonClassName("secondary", "sm")}>
              Edit
            </Link>
          ) : null}
        </div>

        {profile.bio ? (
          <p className="text-sm text-ink mt-4 whitespace-pre-line">{profile.bio}</p>
        ) : null}

        {profile.learningTags.length ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint mb-1.5">
              Currently learning
            </p>
            {/*
              These were `bg-accent-100`, a colour token that does not exist --
              Tailwind emitted nothing for it, so the tags had a transparent
              background and read as loose words. Gold is the accent the design
              actually defines.
            */}
            <div className="flex flex-wrap gap-1.5">
              {profile.learningTags.map((tag) => (
                <Badge key={tag} tone="gold">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <Card flush>
        <div className="p-4 pb-2">
          <CardHeader
            title="Currently reading"
            action={
              isSelf ? (
                <Link href="/me/reading" className={buttonClassName("ghost", "sm")}>
                  Manage
                </Link>
              ) : undefined
            }
          />
        </div>
        {reading.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title={isSelf ? "Nothing on the go" : `${profile.firstName} isn't reading anything right now`}
            description={isSelf ? "Add a book to show it on your profile." : undefined}
          />
        ) : (
          <ul className="divide-y divide-line">
            {reading.map((item) => (
              <li key={item.id} className="px-4 py-3">
                <p className="font-medium text-ink">{item.title}</p>
                {item.author ? (
                  <p className="text-sm text-ink-muted">{item.author}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card flush>
        <div className="p-4 pb-2">
          <CardHeader title={`Books read (${read.length})`} />
        </div>
        {read.length === 0 ? (
          <EmptyState compact title="No finished books yet" />
        ) : (
          <ul className="divide-y divide-line">
            {read.map((item) => (
              <li key={item.id} className="px-4 py-3 flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{item.title}</p>
                  {item.author ? (
                    <p className="text-sm text-ink-muted">{item.author}</p>
                  ) : null}
                </div>
                {item.dateRead ? (
                  <p className="text-xs text-ink-faint shrink-0">
                    {formatDate(item.dateRead)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
