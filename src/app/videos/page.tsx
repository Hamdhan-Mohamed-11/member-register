import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClassName } from "@/components/ui/Button";
import { VideoCard } from "@/components/videos/VideoCard";
import { requireActiveMember } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { listApprovedVideos } from "@/lib/videos/queries";

export const metadata: Metadata = { title: "Videos" };

export default async function VideosPage() {
  const member = await requireActiveMember();
  const videos = await listApprovedVideos();

  return (
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: avatarUrl(member.userId, member.avatarPath),
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Videos</h1>
          <p className="text-sm text-ink-muted">
            Session recordings and things members have shared.
          </p>
        </div>
        <Link href="/videos/submit" className={buttonClassName("primary", "sm")}>
          Add a video
        </Link>
      </div>

      {videos.length === 0 ? (
        <Card flush>
          <EmptyState
            title="No videos yet"
            description="Session recordings will appear here, and you can share one of your own."
            action={
              <Link href="/videos/submit" className={buttonClassName("secondary", "sm")}>
                Add a video
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
