import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import {
  CreateClubForm,
  CreateTypeForm,
  EditClubForm,
  EditTypeForm,
  InviteToClubForm,
  type ClubRow,
  type ClubTypeOption,
} from "./ClubForms";

export const metadata: Metadata = { title: "Clubs" };

type RawType = {
  id: string;
  name: string;
  slug: string;
  member_visibility: string;
  requires_guardian: boolean;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type RawClub = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  type_id: string | null;
  membership_fee_lkr: number | null;
  term_months: number | null;
  is_active: boolean;
  is_open_join: boolean;
  club_memberships: { status: string }[] | null;
};

export default async function AdminClubsPage() {
  await requireSuperAdmin();
  const supabase = await getServerComponentSupabase();

  const [{ data: typeRows, error: typeError }, { data: clubRows, error: clubError }] =
    await Promise.all([
      supabase
        .from("club_types")
        .select(
          "id, name, slug, member_visibility, requires_guardian, description, sort_order, is_active",
        )
        .order("sort_order")
        .order("name"),
      supabase
        .from("clubs")
        .select(
          `id, name, description, kind, type_id, membership_fee_lkr, term_months,
           is_active, is_open_join, club_memberships ( status )`,
        )
        .order("name"),
    ]);

  const clubs: ClubRow[] = ((clubRows ?? []) as unknown as RawClub[]).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    kind: c.kind,
    typeId: c.type_id,
    feeLkr: c.membership_fee_lkr == null ? null : Number(c.membership_fee_lkr),
    termMonths: c.term_months,
    isActive: c.is_active,
    isOpenJoin: c.is_open_join,
    memberCount: (c.club_memberships ?? []).filter((m) => m.status === "active").length,
  }));

  const types: ClubTypeOption[] = ((typeRows ?? []) as unknown as RawType[]).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    memberVisibility: t.member_visibility === "type" ? "type" : "club",
    requiresGuardian: t.requires_guardian,
    description: t.description,
    sortOrder: t.sort_order,
    isActive: t.is_active,
    clubCount: clubs.filter((c) => c.typeId === t.id).length,
  }));

  // A club whose type_id is null is not an error state to hide -- it is a real
  // possibility (a club created before types existed, or by a path that does
  // not set one) and it fails closed to same-club visibility. Showing it in its
  // own group is how an admin notices and files it.
  const untyped = clubs.filter((c) => !c.typeId);

  return (
    <AppShell>
      <BackLink href="/admin">Admin</BackLink>
      <PageHeader
        className="mt-1"
        title="Clubs and club types"
        description="A type decides who its clubs' members can see — themselves only, or everyone across the type. The directory and the leaderboard both follow it."
      />

      {typeError || clubError ? (
        <Card className="mb-4">
          <Notice>
            Couldn&apos;t load clubs: {(typeError ?? clubError)?.message}
          </Notice>
        </Card>
      ) : null}

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Add a club type"
            description="Kids, Teen, Public, Special, Corporate — and anything else you need later."
          />
          <CreateTypeForm />
        </Card>

        <Card>
          <CardHeader
            title="Add a club"
            description="Files the club under a type. Company clubs are created from the Companies page instead, and are always Corporate."
          />
          <CreateClubForm types={types} />
        </Card>

        {types.length === 0 ? (
          <Card flush>
            <EmptyState
              title="No club types yet"
              description="Add one above, then file clubs under it."
            />
          </Card>
        ) : null}

        {types.map((type) => {
          const inType = clubs.filter((c) => c.typeId === type.id);
          return (
            <Card key={type.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {type.name}
                    {type.memberVisibility === "type" ? (
                      <Badge tone="brand">Shared directory</Badge>
                    ) : (
                      <Badge>Club by club</Badge>
                    )}
                    {type.requiresGuardian ? <Badge tone="gold">Guardian account</Badge> : null}
                    {type.isActive ? null : <Badge tone="danger">Retired</Badge>}
                  </span>
                }
                description={
                  type.description ??
                  (type.memberVisibility === "type"
                    ? "Members of every club under this type see each other."
                    : "Members see only their own club.")
                }
              />

              {inType.length === 0 ? (
                <p className="text-sm text-ink-muted">No clubs filed under this type yet.</p>
              ) : (
                <ul className="divide-y divide-line border-y border-line">
                  {inType.map((club) => (
                    <li key={club.id} className="py-3">
                      <details className="group">
                        <summary className="flex items-center justify-between gap-3 cursor-pointer list-none select-none">
                          <span className="min-w-0">
                            <span className="block font-medium text-ink truncate">
                              {club.name}
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {club.memberCount} member{club.memberCount === 1 ? "" : "s"}
                              {club.feeLkr != null
                                ? ` · LKR ${club.feeLkr.toLocaleString("en-LK")}`
                                : " · default fee"}
                              {club.termMonths ? ` · ${club.termMonths} months` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 flex items-center gap-2">
                            {club.isOpenJoin ? <Badge tone="success">Open to apply</Badge> : null}
                            {club.isActive ? null : <Badge tone="danger">Off</Badge>}
                            <span className="text-sm text-brand-600 font-medium">
                              <span className="group-open:hidden">Edit</span>
                              <span className="hidden group-open:inline">Close</span>
                            </span>
                          </span>
                        </summary>

                        <div className="mt-4 grid gap-5 lg:grid-cols-2">
                          <EditClubForm club={club} types={types} />
                          <div className="lg:border-l lg:border-line lg:pl-5">
                            <h3 className="font-display text-base text-ink mb-2">
                              Invite people to {club.name}
                            </h3>
                            <InviteToClubForm clubId={club.id} clubName={club.name} />
                          </div>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}

              <details className="mt-3 group">
                <summary className="text-sm text-brand-600 cursor-pointer list-none select-none">
                  <span className="group-open:hidden">Edit this type</span>
                  <span className="hidden group-open:inline">Close</span>
                </summary>
                <div className="mt-3">
                  <EditTypeForm type={type} />
                </div>
              </details>
            </Card>
          );
        })}

        {untyped.length ? (
          <Card tone="warning">
            <CardHeader
              title="Not filed under a type"
              description="These clubs fall back to showing members only their own club. Open one and choose a type."
            />
            <ul className="divide-y divide-line border-t border-line">
              {untyped.map((club) => (
                <li key={club.id} className="py-3">
                  <details className="group">
                    <summary className="flex items-center justify-between gap-3 cursor-pointer list-none select-none">
                      <span className="font-medium text-ink truncate">{club.name}</span>
                      <span className="text-sm text-brand-600 font-medium shrink-0">
                        <span className="group-open:hidden">Edit</span>
                        <span className="hidden group-open:inline">Close</span>
                      </span>
                    </summary>
                    <div className="mt-4">
                      <EditClubForm club={club} types={types} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
