import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatLkr } from "@/components/sessions/SessionCard";
import { membershipState, requireActiveMember } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { isPayHereConfigured } from "@/lib/payments/payhere";
import { startClubPayment } from "./actions";
import { PayButton } from "./PayButton";

export const metadata: Metadata = { title: "Membership" };

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATE_COPY = {
  active: { tone: "text-success-600", label: "Active" },
  expiring_soon: { tone: "text-warning-600", label: "Expiring soon" },
  expired: { tone: "text-danger-600", label: "Expired" },
  none: { tone: "text-ink-faint", label: "No renewal date" },
} as const;

export default async function RenewPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const member = await requireActiveMember();
  const { cancelled } = await searchParams;
  const supabase = await getServerComponentSupabase();

  const [{ data: settings }, { data: membershipRows }, { data: publicClubs }] =
    await Promise.all([
      supabase
        .from("app_settings")
        .select("membership_fee_lkr, membership_term_months, expiring_soon_days")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("club_memberships")
        .select("id, status, renewal_date, is_primary, clubs(id, name, kind, membership_fee_lkr, term_months)")
        .eq("member_id", member.userId),
      supabase
        .from("clubs")
        .select("id, name, description, membership_fee_lkr, term_months")
        .eq("kind", "public")
        .eq("is_active", true)
        .order("name"),
    ]);

  type Row = {
    id: string;
    status: string;
    renewal_date: string | null;
    is_primary: boolean;
    clubs: {
      id: string;
      name: string;
      kind: string;
      membership_fee_lkr: number | null;
      term_months: number | null;
    } | null;
  };

  const memberships = ((membershipRows ?? []) as unknown as Row[]).filter((m) => m.clubs);
  const joinedIds = new Set(memberships.map((m) => m.clubs!.id));
  const joinable = (publicClubs ?? []).filter((c) => !joinedIds.has(c.id));

  const defaultFee = Number(settings?.membership_fee_lkr ?? 0);
  const defaultTerm = settings?.membership_term_months ?? 12;
  const expiringSoonDays = settings?.expiring_soon_days ?? 30;

  const feeOf = (club: { membership_fee_lkr: number | null }) =>
    club.membership_fee_lkr != null ? Number(club.membership_fee_lkr) : defaultFee;
  const termOf = (club: { term_months: number | null }) =>
    club.term_months ?? defaultTerm;

  const configured = isPayHereConfigured();

  return (
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: avatarUrl(member.userId, member.avatarPath),
      }}
    >
      <div className="mb-4">
        <Link href="/me" className="text-sm text-brand-600 hover:underline">
          ← My profile
        </Link>
        <h1 className="font-display text-2xl text-ink mt-1">Membership</h1>
        <p className="text-sm text-ink-muted">
          Each club is paid for separately and renews on its own date.
        </p>
      </div>

      <div className="space-y-4">
        {cancelled ? (
          <Notice tone="info">
            Payment cancelled — nothing has been charged.
          </Notice>
        ) : null}

        {!configured ? (
          <Notice tone="info">
            Online payment isn&apos;t connected yet. You can see what&apos;s due
            here; please settle with the club directly for now.
          </Notice>
        ) : null}

        <Card flush>
          <div className="p-4 pb-2">
            <CardHeader title="Your clubs" />
          </div>

          {memberships.length === 0 ? (
            <EmptyState title="You're not in any club yet" />
          ) : (
            <ul className="divide-y divide-line">
              {memberships.map((m) => {
                const club = m.clubs!;
                const state =
                  m.status === "active"
                    ? membershipState(m.renewal_date, expiringSoonDays)
                    : "expired";
                const copy = STATE_COPY[state];

                return (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {club.name}
                          {m.is_primary ? (
                            <span className="ml-2 text-xs text-ink-faint">primary</span>
                          ) : null}
                        </p>
                        <p className="text-sm text-ink-muted">
                          Renews {formatDate(m.renewal_date)} ·{" "}
                          {formatLkr(feeOf(club))} for {termOf(club)} months
                        </p>
                      </div>
                      <span className={`shrink-0 text-sm font-medium ${copy.tone}`}>
                        {copy.label}
                      </span>
                    </div>

                    {configured ? (
                      <div className="mt-3">
                        <PayButton
                          action={startClubPayment}
                          fields={{ clubId: club.id }}
                          variant={state === "active" ? "secondary" : "primary"}
                          label={`Renew · ${formatLkr(feeOf(club))}`}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {joinable.length ? (
          <Card flush>
            <div className="p-4 pb-2">
              <CardHeader
                title="Join another club"
                description="Pay to join — no approval needed for public clubs you pay for."
              />
            </div>
            <ul className="divide-y divide-line">
              {joinable.map((club) => (
                <li key={club.id} className="px-4 py-3">
                  <p className="font-medium text-ink">{club.name}</p>
                  {club.description ? (
                    <p className="text-sm text-ink-muted">{club.description}</p>
                  ) : null}
                  <p className="text-sm text-ink-muted mt-1">
                    {formatLkr(feeOf(club))} for {termOf(club)} months
                  </p>
                  {configured ? (
                    <div className="mt-3">
                      <PayButton
                        action={startClubPayment}
                        fields={{ clubId: club.id }}
                        label={`Join · ${formatLkr(feeOf(club))}`}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
