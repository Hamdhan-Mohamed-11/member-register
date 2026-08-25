import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Field";
import { formatLkr } from "@/components/sessions/SessionCard";
import { requireSuperAdmin } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { getPayHereMode, isPayHereConfigured } from "@/lib/payments/payhere";
import { MarkPaid } from "./MarkPaid";

export const metadata: Metadata = { title: "Payments" };

const STATUS_TONE: Record<string, string> = {
  success: "text-success-600",
  manual: "text-success-600",
  pending: "text-warning-600",
  failed: "text-danger-600",
  cancelled: "text-ink-faint",
  chargedback: "text-danger-600",
};

const PURPOSE_LABEL: Record<string, string> = {
  club_membership: "Club membership",
  session_booking: "Session booking",
  book_order: "Book order",
};

type PaymentRow = {
  id: string;
  purpose: string;
  provider_order_ref: string;
  provider_payment_id: string | null;
  amount_lkr: number;
  status: string;
  note: string | null;
  created_at: string;
  paid_at: string | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
  clubs: { name: string } | null;
};

export default async function PaymentsPage() {
  const admin = await requireSuperAdmin();
  const supabase = await getServerComponentSupabase();

  const [{ data, error }, { data: events }] = await Promise.all([
    supabase
      .from("payments")
      .select(
        `id, purpose, provider_order_ref, provider_payment_id, amount_lkr, status,
         note, created_at, paid_at,
         profiles ( first_name, last_name, email ),
         clubs ( name )`,
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("payment_events")
      .select("id, provider_order_ref, status_code, signature_ok, applied, outcome, received_at")
      .order("received_at", { ascending: false })
      .limit(20),
  ]);

  const payments = (data ?? []) as unknown as PaymentRow[];
  const configured = isPayHereConfigured();

  return (
    <AppShell
      member={{
        firstName: admin.firstName,
        lastName: admin.lastName,
        avatarUrl: avatarUrl(admin.userId, admin.avatarPath),
      }}
    >
      <div className="mb-4">
        <Link href="/admin" className="text-sm text-brand-600 hover:underline">
          ← Admin
        </Link>
        <h1 className="font-display text-2xl text-ink mt-1">Payments</h1>
        <p className="text-sm text-ink-muted">
          {configured
            ? `PayHere is connected in ${getPayHereMode()} mode.`
            : "PayHere is not configured yet."}
        </p>
      </div>

      <div className="space-y-4">
        {!configured ? (
          <Notice tone="info">
            Set PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET to accept online
            payments. Until then, record payments here by hand as they come in.
          </Notice>
        ) : null}

        {error ? (
          <Card>
            <Notice>Couldn&apos;t load payments: {error.message}</Notice>
          </Card>
        ) : payments.length === 0 ? (
          <Card flush>
            <EmptyState
              title="No payments yet"
              description="Membership and booking payments will appear here."
            />
          </Card>
        ) : (
          <Card flush>
            <ul className="divide-y divide-line">
              {payments.map((p) => {
                const who =
                  `${p.profiles?.first_name ?? ""} ${p.profiles?.last_name ?? ""}`.trim() ||
                  p.profiles?.email ||
                  "Unknown";
                const settled = p.status === "success" || p.status === "manual";

                return (
                  <li key={p.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">
                          {who} · {formatLkr(p.amount_lkr)}
                        </p>
                        <p className="text-sm text-ink-muted truncate">
                          {PURPOSE_LABEL[p.purpose] ?? p.purpose}
                          {p.clubs?.name ? ` · ${p.clubs.name}` : ""}
                        </p>
                        <p className="text-xs text-ink-faint mt-0.5 break-all">
                          {p.provider_order_ref}
                          {p.provider_payment_id ? ` · PayHere ${p.provider_payment_id}` : ""}
                          {" · "}
                          {new Date(p.created_at).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {p.note ? (
                          <p className="text-xs text-ink-muted mt-1 italic">{p.note}</p>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 text-sm font-medium ${
                          STATUS_TONE[p.status] ?? "text-ink-muted"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>

                    {!settled ? <MarkPaid paymentId={p.id} /> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card flush>
          <div className="p-4 pb-2">
            <CardHeader
              title="Recent notifications"
              description="Every callback PayHere sent, including rejected ones."
            />
          </div>
          {(events ?? []).length === 0 ? (
            <EmptyState
              title="Nothing received yet"
              description="PayHere hasn't called the webhook. Until the site is on a public HTTPS domain, it cannot."
            />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {(events ?? []).map((e) => (
                <li key={e.id} className="px-4 py-2 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-ink-muted">
                    {e.provider_order_ref} · code {e.status_code} · {e.outcome}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      !e.signature_ok
                        ? "text-danger-600"
                        : e.applied
                          ? "text-success-600"
                          : "text-ink-faint"
                    }`}
                  >
                    {!e.signature_ok ? "bad signature" : e.applied ? "applied" : "ignored"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
