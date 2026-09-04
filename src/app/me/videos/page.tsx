import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClassName } from "@/components/ui/Button";
import { VideoCard } from "@/components/videos/VideoCard";
import { WithdrawVideo } from "@/app/videos/VideoActions";
import { requireActiveMember } from "@/lib/auth/session";
import { listMyVideos } from "@/lib/videos/queries";

export const metadata: Metadata = { title: "My videos" };

export default async function MyVideosPage() {
  const member = await requireActiveMember();
  const videos = await listMyVideos(member.userId);

  return (
    <AppShell>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <BackLink href="/me">My profile</BackLink>
          <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">My videos</h1>
          <p className="text-sm text-ink-muted">
            Only you and the club admins can see anything still awaiting review.
          </p>
        </div>
        <Link href="/videos/submit" className={buttonClassName("secondary", "sm")}>
          Add
        </Link>
      </div>

      {videos.length === 0 ? (
        <Card flush>
          <EmptyState
            title="You haven't added any videos"
            description="Share a recording or something you think the club would enjoy."
            action={
              <Link href="/videos/submit" className={buttonClassName("primary", "sm")}>
                Add a video
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} showStatus>
              {video.status === "pending" ? <WithdrawVideo videoId={video.id} /> : null}
            </VideoCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
