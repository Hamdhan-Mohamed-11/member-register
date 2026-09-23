import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { CLUB_TZ } from "@/lib/time";
import { DecideClub } from "./DecideClub";

export const metadata: Metadata = { title: "Club applications" };

type Row = {
  id: string;
  club_name: string;
  description: string | null;
  city: string | null;
  meets: string | null;
  member_count: number | null;
  message: string | null;
  status: string;
  decline_reason: string | null;
  created_at: string;
  profiles: { first_name: string; last_name: string; email: string } | null;
};

export default async function ClubRequestsPage() {
  await requireSuperAdmin();
  const supabase = await getServerComponentSupabase();

  const { data, error } = await supabase
    .from("club_requests")
    .select(
      `id, club_name, description, city, meets, member_count, message, status,
       decline_reason, created_at,
       profiles!club_requests_applicant_id_fkey ( first_name, last_name, email )`,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) console.error("[admin] club requests:", error.message);

  const rows = (data ?? []) as unknown as Row[];
  const waiting = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <AdminShell>
      <div className="mb-4">
        <BackLink href="/admin">Admin</BackLink>
        <h1 className="page-title mt-1 font-display text-2xl text-ink sm:text-3xl">
          Club applications
        </h1>
        <p className="text-sm text-ink-muted">
          Clubs asking to come onto the portal. Approving creates the club,
          private, with the applicant as its club admin.
        </p>
      </div>

      <div className="space-y-4">
        <Card flush>
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <CardHeader title={`${waiting.length} waiting`} />
          </div>

          {waiting.length === 0 ? (
            <EmptyState compact icon="check" title="Nothing waiting" />
          ) : (
            <ul className="divide-y divide-line">
              {waiting.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{r.club_name}</p>
                    <p className="text-sm text-ink-muted">
                      {[
                        r.profiles
                          ? `${r.profiles.first_name} ${r.profiles.last_name}`.trim()
                          : null,
                        r.profiles?.email,
                        r.city,
                        r.meets,
                        r.member_count != null ? `${r.member_count} members` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {r.description ? (
                      <p className="mt-1 text-sm text-ink-muted">{r.description}</p>
                    ) : null}
                    {r.message ? (
                      <p className="mt-1 text-sm text-ink">{r.message}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-faint">
                      Applied{" "}
                      {new Date(r.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: CLUB_TZ,
                      })}
                    </p>
                  </div>

                  <DecideClub id={r.id} clubName={r.club_name} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {decided.length > 0 ? (
          <Card flush>
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <CardHeader title="Decided" description="The last hundred." />
            </div>
            <ul className="divide-y divide-line">
              {decided.map((r) => (
                <li key={r.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{r.club_name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        r.status === "approved"
                          ? "bg-success-100 text-success-700"
                          : "bg-danger-100 text-danger-700"
                      }`}
                    >
                      {r.status === "approved" ? "Created" : "Declined"}
                    </span>
                  </div>
                  {r.decline_reason ? (
                    <p className="mt-0.5 text-sm text-ink-muted">{r.decline_reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
