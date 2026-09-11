import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import {
  CreateClubForm,
  CreateTypeForm,
  type ClubRow,
  type ClubTypeOption,
  type MemberOption,
} from "./ClubForms";
import { ClubManager } from "./ClubManager";

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
  secretary_id: string | null;
  secretary: { id: string; first_name: string; last_name: string } | null;
  club_memberships: { status: string }[] | null;
};

export default async function AdminClubsPage() {
  await requireSuperAdmin();
  const supabase = await getServerComponentSupabase();

  const [
    { data: typeRows, error: typeError },
    { data: clubRows, error: clubError },
    { data: memberRows },
  ] = await Promise.all([
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
           is_active, is_open_join, secretary_id,
           secretary:profiles!clubs_secretary_id_fkey ( id, first_name, last_name ),
           club_memberships ( status )`,
        )
        .order("name"),
      // Everyone who could be appointed. Active members only -- the RPC
      // refuses anyone else, and offering a suspended member would be a
      // strange thing to do.
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("status", "active")
        .order("first_name"),
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
    secretaryId: c.secretary_id,
    secretaryName: c.secretary
      ? `${c.secretary.first_name} ${c.secretary.last_name}`.trim()
      : null,
    memberCount: (c.club_memberships ?? []).filter((m) => m.status === "active").length,
  }));

  const members: MemberOption[] = (
    (memberRows ?? []) as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      email: string;
    }[]
  ).map((m) => ({
    id: m.id,
    name: `${m.first_name} ${m.last_name}`.trim() || m.email,
    email: m.email,
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
          <Notice>Couldn&apos;t load clubs: {(typeError ?? clubError)?.message}</Notice>
        </Card>
      ) : null}

      {/*
        Creating is two small forms side by side at the top; managing is the
        list below. Splitting them that way means the page reads as "add
        something" then "here is what exists", rather than as a wall of
        expandable rows that each hide a different form.
      */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6 stagger">
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
            description="Files the club under a type. Company clubs come from the Companies page instead and are always Corporate."
          />
          <CreateClubForm types={types} />
        </Card>
      </div>

      {types.length === 0 ? (
        <Card flush>
          <EmptyState
            title="No club types yet"
            description="Add one above, then file clubs under it."
          />
        </Card>
      ) : (
        <ClubManager
          types={types}
          clubs={clubs}
          members={members}
          untyped={untyped}
        />
      )}
    </AppShell>
  );
}
