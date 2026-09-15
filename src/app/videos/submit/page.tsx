import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { isAdmin, requireActiveMember } from "@/lib/auth/session";
import { SubmitVideoForm } from "../SubmitVideoForm";

export const metadata: Metadata = { title: "Add a video" };

export default async function SubmitVideoPage() {
  const member = await requireActiveMember();
  const admin = isAdmin(member);

  return (
    <AppShell>
      <BackLink href="/videos">Recordings</BackLink>
      <PageHeader
        className="mt-1"
        title="Add a video"
        description={
          admin
            ? "Share a recording with the club. Anything you add is published straight away."
            : "Share a session recording or a talk with the club. A club admin reviews it before it appears for everyone."
        }
      />

      {/* Form and preview side by side on a wide screen, instead of one
          narrow card in a wide empty page (review item 2). */}
      <SubmitVideoForm isAdmin={admin} />
    </AppShell>
  );
}
