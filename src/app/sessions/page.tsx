import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SessionCard } from "@/components/sessions/SessionCard";
import { activeMemberships, requireActiveMember } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { listSessions } from "@/lib/sessions/queries";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const member = await requireActiveMember();
  const sessions = await listSessions();
  const myClubIds = new Set(activeMemberships(member).map((m) => m.clubId));

  // isPast is resolved by the query layer -- see the note on SessionSummary.
  // The list arrives newest-first, so upcoming is reversed to read soonest-first.
  const upcoming = sessions.filter((s) => !s.isPast).reverse();
  const past = sessions.filter((s) => s.isPast);

  // Resolved locally rather than with a round-trip per session: the rule is
  // "free if you are in the host club", and we already know both sides.
  // session_fee_for() remains the authority at booking time.
  function feeFor(s: (typeof sessions)[number]): number {
    if (s.pricingKind === "free") return 0;
    if (s.hostClub && myClubIds.has(s.hostClub.id)) return 0;
    return Number(s.guestFeeLkr ?? 0);
  }

  return (
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: avatarUrl(member.userId, member.avatarPath),
      }}
    >
      <div className="mb-4">
        <h1 className="font-display text-2xl text-ink">Sessions</h1>
        <p className="text-sm text-ink-muted">
          Your clubs&apos; sessions are free. You can book other clubs&apos;
          paid sessions as a guest.
        </p>
      </div>

      {sessions.length === 0 ? (
        <Card flush>
          <EmptyState
            title="No sessions yet"
            description="Book presentations will appear here once a club schedules one."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {upcoming.length ? (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint mb-2">
                Coming up
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {upcoming.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    fee={feeFor(s)}
                    href={`/sessions/${s.id}`}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {past.length ? (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint mb-2">
                Past
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {past.map((s) => (
                  <SessionCard key={s.id} session={s} href={`/sessions/${s.id}`} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
