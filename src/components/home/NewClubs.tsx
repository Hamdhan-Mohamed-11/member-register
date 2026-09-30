import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { formatLkr } from "@/components/sessions/SessionCard";
import { relativeTime } from "@/lib/time";

export type NewClub = {
  id: string;
  name: string;
  description: string | null;
  typeName: string | null;
  feeLkr: number | null;
  announcedAt: string | null;
};

/**
 * Clubs have no uploaded logo, so each one gets a crest: its initials on a
 * colour picked from its id. Hashing the id rather than the name keeps a
 * club's colour steady if it is renamed, and the same club looks the same on
 * every visit. Full class strings so Tailwind sees them at build time.
 */
const CRESTS = [
  { tile: "bg-brand-700 text-white", band: "from-brand-100 to-brand-50" },
  { tile: "bg-sky-700 text-white", band: "from-sky-200 to-sky-100" },
  { tile: "bg-emerald-700 text-white", band: "from-emerald-100 to-emerald-50" },
  { tile: "bg-rose-700 text-white", band: "from-rose-100 to-rose-50" },
  { tile: "bg-violet-700 text-white", band: "from-violet-100 to-violet-50" },
  { tile: "bg-amber-600 text-white", band: "from-amber-100 to-amber-50" },
  { tile: "bg-teal-700 text-white", band: "from-teal-100 to-teal-50" },
];

function crestFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CRESTS[h % CRESTS.length];
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * "A new club has opened" on the feed.
 *
 * Only clubs the reader can actually apply to reach this: public, open for
 * applications, and not one they are already in. An announcement for a club
 * that will not take them is an advert, not news.
 */
export function NewClubs({ clubs }: { clubs: NewClub[] }) {
  if (clubs.length === 0) return null;

  const shown = clubs.slice(0, 3);

  return (
    <section aria-labelledby="new-clubs-heading">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-sky-100 text-sky-800">
            <Icon name="sparkle" className="size-4" />
          </span>
          <h2 id="new-clubs-heading" className="font-display text-xl text-ink sm:text-2xl">
            {clubs.length === 1 ? "A new club opened" : "New clubs to join"}
          </h2>
        </div>
        {clubs.length > shown.length ? (
          <Link
            href="/renew"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            See all {clubs.length}
            <Icon name="chevron-right" className="size-4" />
          </Link>
        ) : null}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((club) => {
          const crest = crestFor(club.id);
          return (
            <li key={club.id} className="min-w-0">
              <Link
                href="/renew"
                aria-label={`${club.name}: see how to join`}
                className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised motion-reduce:hover:translate-y-0"
              >
                <div className={`relative h-16 bg-gradient-to-br ${crest.band}`}>
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sky-800">
                    <Icon name="sparkle" className="size-3" />
                    New
                  </span>
                </div>

                <div className="flex flex-1 flex-col px-4 pb-4">
                  <span
                    aria-hidden
                    className={`-mt-7 grid size-14 place-items-center rounded-2xl font-display text-xl ring-4 ring-surface shadow-card ${crest.tile}`}
                  >
                    {initials(club.name)}
                  </span>

                  <h3 className="mt-3 truncate font-display text-lg leading-tight text-ink">
                    {club.name}
                  </h3>

                  {club.typeName ? (
                    <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-canvas-deep px-2 py-0.5 text-xs font-medium text-ink-muted">
                      <Icon name="users" className="size-3.5" />
                      {club.typeName}
                    </span>
                  ) : null}

                  <p className="mb-4 mt-2 line-clamp-2 text-sm text-ink-muted">
                    {club.description || "A new reading circle, open for members to join."}
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3 text-xs">
                    <span className="text-ink-faint">
                      {club.announcedAt ? `Opened ${relativeTime(club.announcedAt)}` : "Just opened"}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-brand-600 group-hover:text-brand-700">
                      {club.feeLkr != null ? formatLkr(club.feeLkr) : "Join"}
                      <Icon
                        name="arrow-right"
                        className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
                      />
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
