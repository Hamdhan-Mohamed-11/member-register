import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { isAdmin, requireActiveMember } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { SubmitVideoForm } from "../SubmitVideoForm";

export const metadata: Metadata = { title: "Add a video" };

export default async function SubmitVideoPage() {
  const member = await requireActiveMember();
  const admin = isAdmin(member);

  return (
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: avatarUrl(member.userId, member.avatarPath),
      }}
    >
      <div className="mb-4">
        <Link href="/videos" className="text-sm text-brand-600 hover:underline">
          ← Videos
        </Link>
        <h1 className="text-2xl font-semibold text-ink mt-1">Add a video</h1>
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
