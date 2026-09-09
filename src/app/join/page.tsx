import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getSessionMember } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { JoinForm, type JoinableClub } from "./JoinForm";

export const metadata: Metadata = { title: "Join a club" };

export default async function JoinPage() {
  if (await getSessionMember()) redirect("/feed");

  // Read as anon. The clubs_select_public_anon policy limits this to active
  // public clubs, so company clubs cannot leak into the picker even if this
  // query forgot to filter -- but filter anyway, so the intent is on the page.
  //
  // is_open_join is the real gate, not kind. Kids, Teen and Special clubs are
  // all kind = 'public' -- they are nobody's private company club -- but only
  // clubs under Public Clubs are offered for self-signup; the others are places
  // an admin puts you. request_club_join enforces the same rule server-side, so
  // a hand-posted club id gets refused rather than quietly queued.
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("clubs")
    .select("id, name, description, club_types ( name, sort_order )")
    .eq("kind", "public")
    .eq("is_active", true)
    .eq("is_open_join", true)
    .order("name");

  type Raw = JoinableClub & {
    club_types: { name: string; sort_order: number } | null;
  };

  const rows = (data ?? []) as unknown as Raw[];
  const clubs: JoinableClub[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    typeName: c.club_types?.name ?? null,
    typeSort: c.club_types?.sort_order ?? 999,
  }));

  return (
    <AppShell signedOut>
      <div className="max-w-sm mx-auto pt-4 sm:pt-10">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl sm:text-3xl text-ink">Join a club</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Pick a club, and the club will confirm your place.
          </p>
        </div>
        <Card>
          {clubs.length ? (
            <JoinForm clubs={clubs} />
          ) : (
            <EmptyState
              title="No clubs are open for applications"
              description="There aren't any public clubs accepting members right now. If your employer has a club, look for your invite email instead."
            />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
