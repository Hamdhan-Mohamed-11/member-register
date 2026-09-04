import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { requireActiveMember } from "@/lib/auth/session";
import { avatarUrl, getMemberProfile } from "@/lib/members/queries";
import { AvatarUpload } from "./AvatarUpload";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const member = await requireActiveMember();
  const profile = await getMemberProfile(member.userId);
  if (!profile) notFound();

  const currentUrl = avatarUrl(member.userId, member.avatarPath);

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/me">My profile</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">Edit profile</h1>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Photo" />
          <AvatarUpload
            userId={member.userId}
            firstName={member.firstName}
            lastName={member.lastName}
            currentUrl={currentUrl}
          />
        </Card>

        <Card>
          <CardHeader title="Details" />
          <ProfileForm
            firstName={profile.firstName}
            lastName={profile.lastName}
            phone={profile.phone ?? ""}
            bio={profile.bio ?? ""}
            learningTags={profile.learningTags}
          />
        </Card>
      </div>
    </AppShell>
  );
}
