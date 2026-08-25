import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getSessionMember } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { getSiteUrl } from "@/lib/supabase/env";
import { JoinForm, type JoinableClub } from "./JoinForm";

export const metadata: Metadata = { title: "Join a club" };

export default async function JoinPage() {
  if (await getSessionMember()) redirect("/feed");

  // Read as anon. The clubs_select_public_anon policy limits this to active
  // public clubs, so company clubs cannot leak into the picker even if this
  // query forgot to filter -- but filter anyway, so the intent is on the page.
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("clubs")
    .select("id, name, description")
    .eq("kind", "public")
    .eq("is_active", true)
    .order("name");

  const clubs = (data ?? []) as JoinableClub[];

  return (
    <AppShell member={null}>
      <div className="max-w-sm mx-auto pt-6">
        <h1 className="font-display text-2xl text-ink text-center mb-5">
          Join Pick a Book
        </h1>
        <Card>
          {clubs.length ? (
            <JoinForm clubs={clubs} siteUrl={getSiteUrl()} />
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
