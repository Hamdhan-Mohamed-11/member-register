import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { AuthLayout } from "@/components/shell/AuthLayout";
import { EmptyState } from "@/components/ui/EmptyState";
import { getSessionMember } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { JoinForm, type JoinableClub } from "./JoinForm";
import { getPublicJoinGuidelines } from "@/lib/settings/texts";

export const metadata: Metadata = { title: "Join a club" };

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string; type?: string }>;
}) {
  if (await getSessionMember()) redirect("/feed");

  // pickabook.club's enrol buttons link here as ?type=public (show only that
  // type's clubs) or ?club=kids-club (preselect one club). Both are slugs, and
  // an unknown one falls back to the full list rather than an empty picker.
  const sp = await searchParams;

  // Read as anon. The clubs_select_public_anon policy limits this to active
  // public clubs, so company clubs cannot leak into the picker even if this
  // query forgot to filter -- but filter anyway, so the intent is on the page.
  //
  // is_open_join is the real gate, not kind. Kids, Teen and Special clubs are
  // all kind = 'public' -- they are nobody's private company club -- but only
  // clubs under Public Clubs are offered for self-signup; the others are places
  // an admin puts you. request_club_join enforces the same rule server-side, so
  // a hand-posted club id gets refused rather than quietly queued.
  const guidelines = await getPublicJoinGuidelines();
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("clubs")
    .select("id, name, slug, description, club_types ( name, slug, sort_order )")
    .eq("kind", "public")
    .eq("is_active", true)
    .eq("is_open_join", true)
    .order("name");

  type Raw = JoinableClub & {
    slug: string;
    club_types: { name: string; slug: string; sort_order: number } | null;
  };

  const all = (data ?? []) as unknown as Raw[];
  const ofType = sp.type ? all.filter((c) => c.club_types?.slug === sp.type) : [];
  const rows = (ofType.length ? ofType : all).sort((a, b) => dayRank(a.name) - dayRank(b.name));
  const preselect = rows.find((c) => c.slug === sp.club)?.id;
  const clubs: JoinableClub[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    typeName: c.club_types?.name ?? null,
    typeSort: c.club_types?.sort_order ?? 999,
  }));

  return (
    <AppShell signedOut wide>
      <AuthLayout
        title="Join a club"
        subtitle="Pick a club, and the club will confirm your place."
      >
        {clubs.length ? (
          <JoinForm clubs={clubs} guidelines={guidelines} preselect={preselect} />
        ) : (
          <EmptyState
            title="No clubs are open for applications"
            description="There aren't any public clubs accepting members right now. If your employer has a club, look for your invite email instead."
          />
        )}
      </AuthLayout>
    </AppShell>
  );
}

// Public Clubs are named for the day they meet. Alphabetical puts Friday
// first, so day-named clubs sort Monday to Weekend; every other name keeps
// the alphabetical order the query returned (Array.sort is stable).
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "weekend"];
function dayRank(name: string): number {
  const i = DAYS.indexOf(name.trim().split(/\s+/)[0].toLowerCase());
  return i === -1 ? DAYS.length : i;
}
