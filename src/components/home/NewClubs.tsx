import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/Button";
import { formatLkr } from "@/components/sessions/SessionCard";

export type NewClub = {
  id: string;
  name: string;
  description: string | null;
  typeName: string | null;
  feeLkr: number | null;
};

/**
 * "A new club has opened" on the feed.
 *
 * Only clubs the reader can actually apply to reach this: public, open for
 * applications, and not one they are already in. An announcement for a club
 * that will not take them is an advert, not news.
 */
export function NewClubs({ clubs }: { clubs: NewClub[] }) {
  if (clubs.length === 0) return null;

  return (
    <Card tone="sky">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-brand-700">
          <Icon name="sparkle" className="size-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            {clubs.length === 1 ? "A new club" : `${clubs.length} new clubs`}
          </p>

          <ul className="mt-1.5 space-y-2.5">
            {clubs.slice(0, 3).map((club) => (
              <li key={club.id}>
                <p className="font-display text-lg leading-tight text-ink">{club.name}</p>
                {club.description ? (
                  <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">
                    {club.description}
                  </p>
                ) : null}
                <p className="mt-0.5 text-xs text-ink-faint">
                  {[club.typeName, club.feeLkr != null ? formatLkr(club.feeLkr) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>

          <Link href="/renew" className={`${buttonClassName("secondary", "sm")} mt-3`}>
            {clubs.length === 1 ? "Have a look" : "See them"}
          </Link>
        </div>
      </div>
    </Card>
  );
}
