import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Field";
import { requireSuperAdmin } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import {
  PointsRulesForm,
  SettingsForm,
  type PointsRule,
  type Settings,
} from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const admin = await requireSuperAdmin();
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
        <h1 className="text-xl font-semibold text-ink mt-1">Settings</h1>
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
