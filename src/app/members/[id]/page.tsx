import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { ProfileView } from "@/components/members/ProfileView";
import { isAdmin, requireActiveMember } from "@/lib/auth/session";
import { getMemberProfile } from "@/lib/members/queries";
import { getBadgesFor } from "@/lib/badges/queries";
import { listMemberVideos } from "@/lib/videos/queries";
import { VideoCard } from "@/components/videos/VideoCard";

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

  const [badges, videos] = await Promise.all([getBadgesFor(id), listMemberVideos(id)]);

  return (
    <AppShell allowStaff>
      <div className="mb-4">
        {isAdmin(viewer) ? (
          <BackLink href="/admin/members">Members</BackLink>
        ) : (
          <BackLink href="/directory">Members</BackLink>
        )}
      </div>

      <ProfileView profile={profile} badges={badges} />

      {/* Their published videos (review item 17). */}
      {videos.length ? (
        <section className="mt-6">
          <h2 className="mb-3 font-display text-xl text-ink">
            Videos from {profile.firstName || "this member"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
