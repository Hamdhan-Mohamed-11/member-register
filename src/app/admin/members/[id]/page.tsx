import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireSuperAdmin } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { AddClubForm, MembershipRow, RoleAndStatus } from "./MemberControls";

export const metadata: Metadata = { title: "Member · Admin" };

type MembershipRowData = {
  id: string;
  status: string;
  is_primary: boolean;
  renewal_date: string | null;
  joined_on: string | null;
  clubs: { id: string; name: string } | null;
};

export default async function AdminMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireSuperAdmin();
  const { id } = await params;
  const supabase = await getServerComponentSupabase();

  const [{ data: profile }, { data: membershipRows }, { data: allClubs }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, email, first_name, last_name, phone, role, status, points_balance, joined_on, avatar_path",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("club_memberships")
        .select("id, status, is_primary, renewal_date, joined_on, clubs(id, name)")
        .eq("member_id", id),
      supabase.from("clubs").select("id, name").eq("is_active", true).order("name"),
    ]);

  if (!profile) notFound();

  const memberships = (membershipRows ?? []) as unknown as MembershipRowData[];
  const joinedClubIds = new Set(memberships.map((m) => m.clubs?.id).filter(Boolean));
  const availableClubs = (allClubs ?? []).filter((c) => !joinedClubIds.has(c.id));

  const name = `${profile.first_name} ${profile.last_name}`.trim() || profile.email;

  return (
    <AppShell
      member={{
        firstName: admin.firstName,
        lastName: admin.lastName,
        avatarUrl: avatarUrl(admin.userId, admin.avatarPath),
      }}
    >
      <div className="mb-4">
        <Link href="/admin/members" className="text-sm text-brand-600 hover:underline">
          ← Members
        </Link>
      </div>

      <div className="space-y-4">
        <Card>
          <div className="flex items-start gap-3">
            <Avatar
              src={avatarUrl(profile.id, profile.avatar_path)}
              firstName={profile.first_name}
              lastName={profile.last_name}
              size="lg"
            />
            <div className="min-w-0">
              <h1 className="font-display text-xl text-ink">{name}</h1>
              <p className="text-sm text-ink-muted truncate">{profile.email}</p>
              {profile.phone ? (
                <p className="text-sm text-ink-muted">{profile.phone}</p>
              ) : null}
              <p className="text-xs text-ink-faint mt-1">
                {profile.points_balance} points · joined{" "}
                {new Date(`${profile.joined_on}T00:00:00`).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <Link
                href={`/members/${profile.id}`}
                className="text-sm text-brand-600 hover:underline"
              >
                View their profile
              </Link>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Role and access" />
          <RoleAndStatus
            memberId={profile.id}
            role={profile.role}
            status={profile.status}
            isSelf={profile.id === admin.userId}
          />
        </Card>

        <Card flush>
          <div className="p-4 pb-2">
            <CardHeader
              title="Club memberships"
              description="Each club renews on its own date."
            />
          </div>

          {memberships.length === 0 ? (
            <EmptyState title="Not in any club" />
          ) : (
            <ul className="divide-y divide-line">
              {memberships.map((m) => (
                <MembershipRow
                  key={m.id}
                  memberId={profile.id}
                  membershipId={m.id}
                  clubName={m.clubs?.name ?? "Unknown club"}
                  status={m.status}
                  renewalDate={m.renewal_date}
                  isPrimary={m.is_primary}
                />
              ))}
            </ul>
          )}

          <div className="px-4 py-3 border-t border-line">
            <AddClubForm memberId={profile.id} clubs={availableClubs} />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
