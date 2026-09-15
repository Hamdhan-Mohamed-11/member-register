import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { BadgeIcon } from "@/components/badges/BadgeIcon";
import { requireActiveMember } from "@/lib/auth/session";
import { getMyBadges, type BadgeFamily, type BadgeRow } from "@/lib/badges/queries";

export const metadata: Metadata = { title: "Achievements" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.3 2.4 2.4 4.6-5" />
    </svg>
  );
}

/**
 * One badge as a tile, the shape of the reference design (review item 22).
 *
 * Unearned badges are shown, not hidden -- half the value of a badge is knowing
 * it exists -- but drained of colour and marked with a lock, so a glance reads
 * as "these are mine, those are next" rather than a wall of equal icons. The
 * earned/locked state is carried by the corner glyph and the pill as well as
 * the colour.
 */
function BadgeTile({
  badge,
  earnedAt,
  caption,
}: {
  badge: BadgeRow;
  earnedAt: string | null;
  caption?: string | null;
}) {
  const earned = earnedAt != null;
  return (
    <li
      className={`relative flex min-w-0 flex-col items-center rounded-card border p-4 text-center ${
        earned ? "border-line bg-surface shadow-card" : "border-line/70 bg-canvas-deep/60"
      }`}
    >
      <span
        className={`absolute right-2.5 top-2.5 ${earned ? "text-success-600" : "text-ink-faint"}`}
      >
        {earned ? <CheckGlyph /> : <LockGlyph />}
        <span className="sr-only">{earned ? "Earned" : "Locked"}</span>
      </span>

      <span
        className={`grid size-14 place-items-center rounded-full border ${
          earned
            ? "border-gold-700/25 bg-gold-100 text-gold-700"
            : "border-line bg-surface text-ink-faint"
        }`}
      >
        <BadgeIcon name={badge.icon} className="size-7" />
      </span>

      <p
        className={`mt-3 font-display text-base leading-tight ${
          earned ? "text-ink" : "text-ink-faint"
        }`}
      >
        {badge.name}
      </p>
      {(caption ?? badge.description) ? (
        <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{caption ?? badge.description}</p>
      ) : null}

      <span className="mt-auto pt-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            earned ? "bg-success-100 text-success-600" : "bg-surface text-ink-faint"
          }`}
        >
          {earned ? `Earned ${formatDate(earnedAt)}` : "Locked"}
        </span>
      </span>
    </li>
  );
}

function FamilySection({ family }: { family: BadgeFamily }) {
  const { best, next, value, unit, label, rungs } = family;
  const target = next?.threshold ?? null;
  // Progress runs from the rung already earned to the next one, not from zero.
  // From zero, a member at 26 books of 50 shows a bar past halfway when they
  // have in fact only just started the rung -- which reads as the bar lying.
  const floor = best?.threshold ?? 0;
  const pct =
    target && target > floor
      ? Math.max(0, Math.min(100, ((value - floor) / (target - floor)) * 100))
      : 100;
  const togo = target != null ? Math.max(0, target - value) : 0;

  return (
    <section className="reveal">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          {label}
        </h2>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
          {family.earned.length} of {rungs.length}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rungs.map((badge) => (
          <BadgeTile
            key={badge.id}
            badge={badge}
            earnedAt={badge.earnedAt}
            caption={badge.threshold != null ? `${badge.threshold} ${unit}` : null}
          />
        ))}
      </ul>

      <Card className="mt-3">
        {next ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-ink tabular-nums">
                {value} / {target} {unit}
              </span>
              <span className="text-xs text-gold-700">
                {togo} more for <span className="font-medium">{next.name}</span>
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas-deep">
              <div
                className="readrise-grow h-full rounded-full bg-brand-600"
                style={{ ["--w" as string]: `${pct}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-sm font-medium text-success-600">
            Every badge in this set earned.
          </p>
        )}
      </Card>
    </section>
  );
}

export default async function BadgesPage() {
  const member = await requireActiveMember();
  const { families, standalone, earnedCount, totalCount } = await getMyBadges(member.userId);

  const oneOffs = [
    ...standalone.filter((s) => s.earnedAt),
    ...standalone.filter((s) => !s.earnedAt),
  ];
  const inProgress = families.filter((f) => f.next != null).length;

  return (
    <AppShell>
      <BackLink href="/me">Me</BackLink>
      <PageHeader
        className="mt-1"
        eyebrow="Your badges"
        title="Achievements"
        description="Earned for coming to sessions, presenting, reading and giving."
      />

      <Card tone="brand" className="mb-6">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700">
            <BadgeIcon name="star" className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-2xl leading-none text-ink tabular-nums">
              {earnedCount}
              <span className="text-base text-ink-muted"> of {totalCount}</span>
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              badges earned
              {inProgress ? ` · ${inProgress} set${inProgress === 1 ? "" : "s"} in progress` : ""}
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-8">
        {families.map((family) => (
          <FamilySection key={family.key} family={family} />
        ))}

        {oneOffs.length ? (
          <section className="reveal">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                One-off badges
              </h2>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                {oneOffs.filter((o) => o.earnedAt).length} of {oneOffs.length}
              </span>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {oneOffs.map(({ badge, earnedAt }) => (
                <BadgeTile key={badge.id} badge={badge} earnedAt={earnedAt} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
