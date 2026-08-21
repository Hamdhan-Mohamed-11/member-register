import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { requireSecretary } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { DecisionButtons } from "./DecisionButtons";

export const metadata: Metadata = { title: "Join requests" };

type RequestRow = {
  id: string;
  message: string | null;
  created_at: string;
  profiles: { first_name: string; last_name: string; email: string } | null;
  clubs: { name: string } | null;
};

export default async function JoinRequestsPage() {
  const member = await requireSecretary();
  const supabase = await getServerComponentSupabase();

  // The `!club_join_requests_member_id_fkey` hint is REQUIRED, not decoration:
  // this table has two foreign keys to profiles (member_id and decided_by), so
  // a bare `profiles(...)` embed fails with PGRST201 "more than one
  // relationship was found" rather than picking one.
  const { data, error } = await supabase
    .from("club_join_requests")
    .select(
      `id, message, created_at,
       profiles!club_join_requests_member_id_fkey(first_name, last_name, email),
       clubs(name)`,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const requests = (data ?? []) as unknown as RequestRow[];

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
        <h1 className="text-xl font-semibold text-ink mt-1">Join requests</h1>
        <p className="text-sm text-ink-muted">
          Approving adds the member to the club and activates their account.
        </p>
      </div>

      {/* Surface the error instead of rendering an empty state over it. A
          failed query and a genuinely empty queue look identical otherwise,
          and "Nothing waiting" is a very convincing way to hide a bug. */}
      {error ? (
        <Card>
          <Notice>
            Couldn&apos;t load join requests: {error.message}
          </Notice>
        </Card>
      ) : requests.length === 0 ? (
        <Card flush>
          <EmptyState
            title="Nothing waiting"
            description="New applications to public clubs will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const name =
              `${request.profiles?.first_name ?? ""} ${request.profiles?.last_name ?? ""}`.trim() ||
              request.profiles?.email ||
              "Unknown applicant";

            return (
              <Card key={request.id}>
                <div className="flex items-start gap-3">
                  <Avatar
                    firstName={request.profiles?.first_name ?? ""}
                    lastName={request.profiles?.last_name ?? ""}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink truncate">{name}</p>
                    <p className="text-sm text-ink-muted truncate">
                      {request.profiles?.email}
                    </p>
                    <p className="text-sm text-ink-muted mt-1">
                      Wants to join{" "}
                      <span className="text-ink">{request.clubs?.name ?? "—"}</span>
                      {" · "}
                      {new Date(request.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    {request.message ? (
                      <p className="text-sm text-ink mt-2 italic">
                        “{request.message}”
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <DecisionButtons requestId={request.id} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
