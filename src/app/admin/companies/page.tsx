import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Field";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { CreateCompanyForm, InviteEmployeesForm } from "./CompanyForms";

export const metadata: Metadata = { title: "Companies" };

type InviteRow = {
  company_id: string | null;
  email: string;
  status: string;
  accepted_at: string | null;
};

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
  await requireSuperAdmin();
  const supabase = await getServerComponentSupabase();

  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, contact_email, is_active, clubs(id, name, membership_fee_lkr, term_months)",
    )
    .order("name");

  const companies = (data ?? []) as unknown as CompanyRow[];

  // Every invite, not just the pending ones. A count of what is outstanding
  // tells an admin how many people have not joined but not WHICH, so chasing
  // anyone up meant going to the database.
  const { data: inviteRows } = await supabase
    .from("invites")
    .select("company_id, email, status, accepted_at")
    .order("email");

  const invitesByCompany = new Map<string, InviteRow[]>();
  for (const row of (inviteRows ?? []) as InviteRow[]) {
    if (!row.company_id) continue;
    const list = invitesByCompany.get(row.company_id) ?? [];
    list.push(row);
    invitesByCompany.set(row.company_id, list);
  }

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/admin">Admin</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">Companies</h1>
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
            const invites = invitesByCompany.get(company.id) ?? [];
            const accepted = invites.filter((i) => i.status === "accepted");
            const pending = invites.filter((i) => i.status === "pending").length;

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

                {/*
                  Who, not just how many. A count says nobody has joined but
                  not which addresses to chase, which meant querying the
                  database to answer an everyday question. <details> keeps the
                  card short for a company with forty employees without
                  needing any client-side state.
                */}
                {invites.length > 0 ? (
                  <details className="mb-3 group">
                    <summary className="text-sm text-ink-muted cursor-pointer list-none select-none hover:text-ink">
                      <span className="text-brand-600 group-open:hidden">Show</span>
                      <span className="text-brand-600 hidden group-open:inline">Hide</span>{" "}
                      {accepted.length} of {invites.length} invite
                      {invites.length === 1 ? "" : "s"} accepted
                      {pending > 0 ? `, ${pending} still waiting` : ""}
                    </summary>

                    <ul className="mt-2 divide-y divide-line border-t border-line">
                      {invites.map((invite) => (
                        <li
                          key={`${invite.email}-${invite.status}`}
                          className="py-2 flex items-center justify-between gap-3"
                        >
                          <span className="text-sm text-ink truncate">{invite.email}</span>
                          <span
                            className={`text-xs font-medium shrink-0 ${
                              invite.status === "accepted"
                                ? "text-success-600"
                                : invite.status === "pending"
                                  ? "text-ink-faint"
                                  : "text-danger-600"
                            }`}
                          >
                            {invite.status === "accepted"
                              ? invite.accepted_at
                                ? `Joined ${new Date(invite.accepted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                                : "Joined"
                              : invite.status === "pending"
                                ? "Not yet"
                                : invite.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
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
