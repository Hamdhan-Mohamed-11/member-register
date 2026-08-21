import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { requireMember } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Awaiting approval" };

const COPY: Record<string, { title: string; body: string }> = {
  pending: {
    title: "Your application is with the club",
    body: "A club admin will review it shortly. You'll be able to see sessions, members and books as soon as you're approved.",
  },
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

  const copy = COPY[member.status] ?? COPY.pending;

  return (
    <AppShell member={null}>
      <div className="max-w-sm mx-auto pt-8 text-center">
        <Card>
          <h1 className="text-lg font-semibold text-ink">{copy.title}</h1>
          <p className="mt-2 text-sm text-ink-muted">{copy.body}</p>
          <p className="mt-4 text-xs text-ink-faint">Signed in as {member.email}</p>

          <form action="/auth/signout" method="post" className="mt-4">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
