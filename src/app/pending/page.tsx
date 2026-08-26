import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { requireMember } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import type { JoinableClub } from "@/app/join/JoinForm";
import { ApplyToClub } from "./ApplyToClub";

export const metadata: Metadata = { title: "Awaiting approval" };

const COPY: Record<string, { title: string; body: string }> = {
  suspended: {
    title: "Your membership is on hold",
    body: "Please get in touch with the club if you think this is a mistake.",
  },
  rejected: {
    title: "Your application wasn't approved",
    body: "Please get in touch with the club if you'd like to know more.",
  },
};

export default async function PendingPage() {
  const member = await requireMember();

  // Approved members have no business here.
  if (member.status === "active") redirect("/feed");

  const supabase = await getServerComponentSupabase();

  const { data: request } = await supabase
    .from("club_join_requests")
    .select("id, status, clubs(name)")
    .eq("member_id", member.userId)
    .eq("status", "pending")
    .maybeSingle();

  const club = request?.clubs as { name: string } | null | undefined;

  // Only offer the picker to someone still in play. A rejected or suspended
  // account re-applying through this page would be a way around the decision.
  const canApply = member.status === "pending" && !request;

  let clubs: JoinableClub[] = [];
  if (canApply) {
    const { data } = await supabase
      .from("clubs")
      .select("id, name, description")
      .eq("kind", "public")
      .eq("is_active", true)
      .order("name");
    clubs = (data ?? []) as JoinableClub[];
  }

  const copy =
    COPY[member.status] ??
    {
      title: "Your application is with the club",
      body: club
        ? `A club admin is reviewing your application to ${club.name}. You'll be able to see sessions, members and books as soon as you're approved.`
        : "A club admin will review it shortly.",
    };

  return (
    <AppShell member={null}>
      <div className="max-w-sm mx-auto pt-8 text-center">
        <Card>
          {canApply ? (
            <>
              <h1 className="font-display text-2xl text-ink">
                One more step
              </h1>
              <p className="mt-2 mb-4 text-sm text-ink-muted">
                Your email is confirmed. Choose the club you&apos;d like to join
                and a club admin will review it.
              </p>
              <ApplyToClub clubs={clubs} />
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl text-ink">{copy.title}</h1>
              <p className="mt-2 text-sm text-ink-muted">{copy.body}</p>
            </>
          )}

          <p className="mt-4 text-xs text-ink-faint">Signed in as {member.email}</p>

          <form action="/auth/signout" method="post" className="mt-2">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
