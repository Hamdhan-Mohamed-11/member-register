import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Field";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import {
  PointsRulesForm,
  SettingsForm,
  type PointsRule,
  type Settings,
} from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireSuperAdmin();
  const supabase = await getServerComponentSupabase();

  const [{ data: settingsRow, error: settingsError }, { data: ruleRows }] =
    await Promise.all([
      supabase
        .from("app_settings")
        .select(
          "membership_fee_lkr, membership_term_months, renewal_grace_days, expiring_soon_days, book_discount_percent",
        )
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("points_rules")
        .select("code, label, points")
        .order("points", { ascending: false }),
    ]);

  const settings: Settings | null = settingsRow
    ? {
        membershipFee: Number(settingsRow.membership_fee_lkr),
        termMonths: settingsRow.membership_term_months,
        graceDays: settingsRow.renewal_grace_days,
        expiringSoonDays: settingsRow.expiring_soon_days,
        bookDiscount: Number(settingsRow.book_discount_percent),
      }
    : null;

  const rules = (ruleRows ?? []) as PointsRule[];

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/admin">Admin</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">Settings</h1>
        <p className="text-sm text-ink-muted">
          Defaults used across the portal. Individual clubs can override the fee
          and term.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Membership and pricing" />
          {settingsError || !settings ? (
            <Notice>
              Couldn&apos;t load settings
              {settingsError ? `: ${settingsError.message}` : "."}
            </Notice>
          ) : (
            <SettingsForm settings={settings} />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Points"
            description="What each kind of participation is worth."
          />
          <PointsRulesForm rules={rules} />
        </Card>
      </div>
    </AppShell>
  );
}
