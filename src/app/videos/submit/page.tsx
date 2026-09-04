import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { isAdmin, requireActiveMember } from "@/lib/auth/session";
import { SubmitVideoForm } from "../SubmitVideoForm";

export const metadata: Metadata = { title: "Add a video" };

export default async function SubmitVideoPage() {
  const member = await requireActiveMember();
  const admin = isAdmin(member);

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/videos">Videos</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">Add a video</h1>
      </div>

      <Card className="max-w-lg">
        <CardHeader
          title="Share a link"
          description={
            admin
              ? "Anything you add is published straight away."
              : "A club admin reviews it before it appears for everyone. You'll be able to watch it yourself in the meantime."
          }
        />
        <SubmitVideoForm isAdmin={admin} />
      </Card>
    </AppShell>
  );
}
