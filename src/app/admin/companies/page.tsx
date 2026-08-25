import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Field";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { CreateCompanyForm, InviteEmployeesForm } from "./CompanyForms";

export const metadata: Metadata = { title: "Companies" };

type CompanyRow = {
  id: string;
  name: string;
  contact_email: string | null;
  is_active: boolean;
  clubs: {
    id: string;
    name: string;
    membership_fee_lkr: number | null;
    term_months: number | null;
  }[];
};

export default async function CompaniesPage() {
  const member = await requireSuperAdmin();
  const supabase = await getServerComponentSupabase();

  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, contact_email, is_active, clubs(id, name, membership_fee_lkr, term_months)",
    )
    .order("name");

  const companies = (data ?? []) as unknown as CompanyRow[];

  // Pending invites per company club, so the admin can see what is outstanding
  // rather than re-inviting people who already have a live link.
  const { data: inviteRows } = await supabase
    .from("invites")
    .select("company_id")
    .eq("status", "pending");

  const pendingByCompany = new Map<string, number>();
  for (const row of inviteRows ?? []) {
    if (!row.company_id) continue;
    pendingByCompany.set(row.company_id, (pendingByCompany.get(row.company_id) ?? 0) + 1);
  }

  return (
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: null,
      }}
    >
      <div className="mb-4">
        <Link href="/admin" className="text-sm text-brand-600 hover:underline">
          ← Admin
        </Link>
        <h1 className="font-display text-2xl text-ink mt-1">Companies</h1>
        <p className="text-sm text-ink-muted">
          Each company gets one private club. Employees join by invite only —
          they never appear in the public member directory.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Add a company" />
          <CreateCompanyForm />
        </Card>

        {error ? (
          <Card>
            <Notice>Couldn&apos;t load companies: {error.message}</Notice>
          </Card>
        ) : companies.length === 0 ? (
          <Card flush>
            <EmptyState
              title="No companies yet"
              description="Add one above and its private club is created automatically."
            />
          </Card>
        ) : (
          companies.map((company) => {
            const club = company.clubs?.[0];
            const pending = pendingByCompany.get(company.id) ?? 0;

            return (
              <Card key={company.id}>
                <CardHeader
                  title={company.name}
                  description={
                    club
                      ? `${club.name}${
                          club.membership_fee_lkr != null
                            ? ` · LKR ${Number(club.membership_fee_lkr).toLocaleString("en-LK")}`
                            : " · default fee"
                        }${club.term_months ? ` · ${club.term_months} months` : ""}`
                      : "No club — this shouldn't happen; contact support."
                  }
                />

                {company.contact_email ? (
                  <p className="text-sm text-ink-muted mb-3">{company.contact_email}</p>
                ) : null}

                {pending > 0 ? (
                  <p className="text-sm text-ink-muted mb-3">
                    {pending} invite{pending === 1 ? "" : "s"} still unaccepted.
                  </p>
                ) : null}

                {club ? (
                  <div className="border-t border-line pt-3">
                    <InviteEmployeesForm clubId={club.id} clubName={club.name} />
                  </div>
                ) : null}
              </Card>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
