import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { ProfileView } from "@/components/members/ProfileView";
import { requireActiveMember } from "@/lib/auth/session";
import { getMemberProfile } from "@/lib/members/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getMemberProfile(id);
  // Fall back to a neutral title rather than leaking a name into the tab of a
  // page the caller is about to be 404'd from.
  if (!profile) return { title: "Member" };
  return { title: `${profile.firstName} ${profile.lastName}`.trim() || "Member" };
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireActiveMember();
  const { id } = await params;

  if (id === viewer.userId) redirect("/me");

  const profile = await getMemberProfile(id);

  // 404, not 403.
  //
  // getMemberProfile returns null when RLS withheld the row -- which covers
  // both "no such member" and "you may not see this member". Distinguishing
  // them would confirm that a particular person exists, which is exactly what
  // the company-club rule is meant to prevent.
  if (!profile) notFound();

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/directory">Members</BackLink>
      </div>

      <ProfileView profile={profile} />
    </AppShell>
  );
}
