import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireClubManager } from "@/lib/auth/session";
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

const ROLE_LABELS: Record<string, string> = {
  member: "Member",
  secretary: "Secretary",
  club_admin: "Club admin",
  super_admin: "Super admin",
};

export default async function AdminMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireClubManager();
  // A club admin can look at their members, but roles, statuses and club
  // memberships are a super admin's to change -- every one of those RPCs
  // refuses them anyway, so the controls are not offered.
  const canEdit = admin.role === "super_admin";
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
      supabase.from("clubs").select("id, name, secretary_id, admin_id").eq("is_active", true).order("name"),
    ]);

  if (!profile) notFound();

  const memberships = (membershipRows ?? []) as unknown as MembershipRowData[];
  const joinedClubIds = new Set(memberships.map((m) => m.clubs?.id).filter(Boolean));
  const availableClubs = (allClubs ?? [])
    .filter((c) => !joinedClubIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));
  const secretaryOf = (allClubs ?? []).find((c) => c.secretary_id === id) ?? null;
  const adminOf = (allClubs ?? []).find((c) => c.admin_id === id) ?? null;
  const secretaryClubs = (allClubs ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    hasSecretary: c.secretary_id != null,
    hasAdmin: c.admin_id != null,
  }));

  const name = `${profile.first_name} ${profile.last_name}`.trim() || profile.email;

  return (
    <AdminShell>
      <div className="mb-4">
        <BackLink href="/admin/members">Members</BackLink>
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
              <h1 className="font-display text-2xl text-ink">{name}</h1>
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

        {canEdit ? (
        <Card>
          <CardHeader title="Role and access" />
          <RoleAndStatus
            memberId={profile.id}
            role={profile.role}
            status={profile.status}
            isSelf={profile.id === admin.userId}
            clubs={secretaryClubs}
            secretaryOf={secretaryOf ? { id: secretaryOf.id, name: secretaryOf.name } : null}
            adminOf={adminOf ? { id: adminOf.id, name: adminOf.name } : null}
          />
        </Card>
        ) : (
          <Card>
            <CardHeader title="Role and access" />
            <p className="text-sm text-ink-muted">
              {ROLE_LABELS[profile.role] ?? profile.role} · {profile.status}. Roles and account
              status are set by a super admin.
            </p>
          </Card>
        )}

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
              {memberships.map((m) =>
                canEdit ? (
                <MembershipRow
                  key={m.id}
                  memberId={profile.id}
                  membershipId={m.id}
                  clubName={m.clubs?.name ?? "Unknown club"}
                  status={m.status}
                  renewalDate={m.renewal_date}
                  isPrimary={m.is_primary}
                />
                ) : (
                  <li key={m.id} className="px-4 py-3 text-sm text-ink">
                    {m.clubs?.name ?? "Unknown club"}{" "}
                    <span className="text-ink-muted">· {m.status}</span>
                  </li>
                ),
              )}
            </ul>
          )}

          {canEdit ? (
            <div className="px-4 py-3 border-t border-line">
              <AddClubForm memberId={profile.id} clubs={availableClubs} />
            </div>
          ) : null}
        </Card>
      </div>
    </AdminShell>
  );
}
