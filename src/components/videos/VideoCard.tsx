import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { VideoItem } from "@/lib/videos/queries";

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  rejected: "danger",
  approved: "success",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting review",
  rejected: "Not published",
  approved: "Published",
};

/**
 * `showStatus` is for the submitter's own list and the moderation queue. The
 * public feed only ever contains approved videos, so a badge there would be
 * noise on every card.
 */
export function VideoCard({
  video,
  showStatus = false,
  children,
}: {
  video: VideoItem;
  showStatus?: boolean;
  children?: React.ReactNode;
}) {
  const submitter = video.submittedBy
    ? `${video.submittedBy.firstName} ${video.submittedBy.lastName}`.trim()
    : null;

  return (
    <Card flush className="overflow-hidden">
      <div className="relative w-full aspect-video bg-ink">
        {/*
          src comes from buildEmbedUrl(provider, id) -- never from the pasted
          URL. See lib/sessions/video.ts.
        */}
        <iframe
          src={video.embedUrl}
          title={video.title}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium text-ink min-w-0">{video.title}</p>
          {showStatus ? (
            <Badge tone={STATUS_TONE[video.status] ?? "neutral"} className="shrink-0">
              {STATUS_LABEL[video.status] ?? video.status}
            </Badge>
          ) : null}
        </div>

        {video.description ? (
          <p className="text-sm text-ink-muted mt-1 whitespace-pre-line">
            {video.description}
          </p>
        ) : null}

        <p className="text-xs text-ink-faint mt-2">
          {submitter ? `Added by ${submitter}` : "Added by the club"}
          {" · "}
          {new Date(video.createdAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>

        {video.session ? (
          <Link
            href={`/sessions/${video.session.id}`}
            className="text-sm text-brand-600 hover:underline"
          >
            From {video.session.title}
          </Link>
        ) : null}

        {video.status === "rejected" && video.reviewNote ? (
          <p className="text-sm text-danger-600 mt-2">{video.reviewNote}</p>
        ) : null}

        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </Card>
  );
}
