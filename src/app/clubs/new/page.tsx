import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { AuthLayout } from "@/components/shell/AuthLayout";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Field";
import { getSessionMember, isAdmin } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { NewClubForm } from "./NewClubForm";

export const metadata: Metadata = { title: "Bring your club to Pick a Book" };

export default async function NewClubPage() {
  const session = await getSessionMember();
  // A club admin already runs one; a super admin creates clubs outright.
  if (session && isAdmin(session)) redirect("/admin");

  let waiting: { clubName: string; createdAt: string } | null = null;
  if (session) {
    const supabase = await getServerComponentSupabase();
    const { data } = await supabase
      .from("club_requests")
      .select("club_name, created_at")
      .eq("status", "pending")
      .maybeSingle();
    if (data) waiting = { clubName: data.club_name, createdAt: data.created_at };
  }

  return (
    <AppShell signedOut wide>
      <AuthLayout
        title="Bring your club to Pick a Book"
        subtitle="Sessions, points, a member list and the shop — for a club that already meets."
      >
        {waiting ? (
          <div className="space-y-3">
            <Notice tone="info">
              Your application for {waiting.clubName} is with Pick a Book.
            </Notice>
            <p className="text-sm text-ink-muted">
              We&apos;ll email you when it has been looked at. Once approved,
              your club is created private with you as its admin.
            </p>
          </div>
        ) : (
          <Card>
            <NewClubForm signedIn={session != null} />
          </Card>
        )}
      </AuthLayout>
    </AppShell>
  );
}
