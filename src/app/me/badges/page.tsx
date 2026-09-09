import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { BadgeIcon } from "@/components/badges/BadgeIcon";
import { requireActiveMember } from "@/lib/auth/session";
import { getMyBadges, type BadgeFamily } from "@/lib/badges/queries";

export const metadata: Metadata = { title: "Achievements" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * A badge disc.
 *
 * Unearned badges are shown, not hidden — half the value of a badge is knowing
 * it exists — but drained of colour and at reduced contrast, so a glance at the
 * page reads as "these are mine, those are next" rather than as a wall of
 * equal-looking icons.
 */
function BadgeDisc({
  icon,
  earned,
  size = "md",
}: {
  icon: string;
  earned: boolean;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-10" : "size-14";
  const glyph = size === "sm" ? "size-5" : "size-7";
  return (
    <span
      className={`${box} shrink-0 grid place-items-center rounded-full border ${
        earned
          ? "bg-gold-100 border-gold-700/25 text-gold-700"
          : "bg-canvas-deep border-line text-ink-faint"
      }`}
    >
      <BadgeIcon name={icon} className={glyph} />
    </span>
  );
}

function FamilyCard({ family }: { family: BadgeFamily }) {
  const { best, next, value, unit, label } = family;
  const target = next?.threshold ?? null;
  // Progress runs from the rung already earned to the next one, not from zero.
  // From zero, a member at 26 books of 50 shows a bar past halfway when they
  // have in fact only just started the rung — which reads as the bar lying.
  const floor = best?.threshold ?? 0;
  const pct =
    target && target > floor
      ? Math.max(0, Math.min(100, ((value - floor) / (target - floor)) * 100))
      : 100;

  return (
    <Card>
      <div className="flex items-start gap-3">
        <BadgeDisc icon={(best ?? next)?.icon ?? "medal"} earned={best != null} />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-ink-faint">{label}</p>
          <p className="font-display text-lg text-ink leading-tight">
            {best ? best.name : next ? `Not earned yet` : label}
          </p>
          <p className="text-sm text-ink-muted mt-0.5">
            {best?.description ?? next?.description ?? ""}
          </p>

          {next ? (
            <div className="mt-3">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-ink-muted">
                  Next: <span className="text-ink font-medium">{next.name}</span>
                </span>
                <span className="text-ink-faint tabular-nums">
                  {value} / {target} {unit}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-canvas-deep overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs font-medium text-success-600">
              Every badge in this set earned.
            </p>
          )}

          {family.earned.length > 1 ? (
            <p className="mt-2 text-xs text-ink-faint">
              Also earned: {family.earned.slice(0, -1).map((b) => b.name).join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default async function BadgesPage() {
  const member = await requireActiveMember();
  const { families, standalone, earnedCount, totalCount } = await getMyBadges(
    member.userId,
  );

  const earnedOneOffs = standalone.filter((s) => s.earnedAt);
  const lockedOneOffs = standalone.filter((s) => !s.earnedAt);

  return (
    <AppShell>
      <BackLink href="/me">Me</BackLink>
      <PageHeader
        className="mt-1"
        title="Achievements"
        description={`You have earned ${earnedCount} of ${totalCount} badges.`}
      />

      <div className="space-y-3">
        {families.map((family) => (
          <FamilyCard key={family.key} family={family} />
        ))}
      </div>

      <h2 className="font-display text-lg text-ink mt-6 mb-3">One-off badges</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {[...earnedOneOffs, ...lockedOneOffs].map(({ badge, earnedAt }) => (
          <Card key={badge.id} className={earnedAt ? "" : "opacity-70"}>
            <div className="flex items-start gap-3">
              <BadgeDisc icon={badge.icon} earned={earnedAt != null} size="sm" />
              <div className="min-w-0">
                <p className="font-medium text-ink leading-tight">{badge.name}</p>
                <p className="text-sm text-ink-muted mt-0.5">{badge.description}</p>
                <p className="text-xs text-ink-faint mt-1">
                  {earnedAt ? `Earned ${formatDate(earnedAt)}` : "Not earned yet"}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
