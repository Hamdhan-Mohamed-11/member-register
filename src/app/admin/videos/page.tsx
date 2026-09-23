import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { VideoCard } from "@/components/videos/VideoCard";
import { ModerateVideo } from "@/app/videos/VideoActions";
import { adminClubScope, requireStaff } from "@/lib/auth/session";
import { listForModeration } from "@/lib/videos/queries";

export const metadata: Metadata = { title: "Videos · Admin" };

export default async function AdminVideosPage() {
  const member = await requireStaff();
  const { pending, recent } = await listForModeration(adminClubScope(member));

  return (
    <AdminShell>
      <div className="mb-4">
        <BackLink href="/admin">Admin</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1 page-title">Videos</h1>
        <p className="text-sm text-ink-muted">
          Member submissions are visible only to them until published here.
          {member.staffClubName
            ? ` Showing ${member.staffClubName}'s sessions only.`
            : ""}
        </p>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint mb-2">
            Awaiting review ({pending.length})
          </h2>

          {pending.length === 0 ? (
            <Card flush>
              <EmptyState
                title="Nothing waiting"
                description="Submissions from members will appear here."
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {pending.map((video) => (
                <VideoCard key={video.id} video={video} showStatus>
                  <ModerateVideo videoId={video.id} status="pending" />
                </VideoCard>
              ))}
            </div>
          )}
        </section>

        {recent.length ? (
          <section>
            <Card flush>
              <div className="p-4 pb-2">
                <CardHeader
                  title="Recently decided"
                  description="Unpublish something if it needs pulling, or publish a rejected one after all."
                />
              </div>
              <ul className="divide-y divide-line">
                {recent.map((video) => (
                  <li
                    key={video.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
                  >
                    <a
                      href={
                        video.provider === "youtube"
                          ? `https://www.youtube.com/watch?v=${video.externalId}`
                          : `https://vimeo.com/${video.externalId}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative block aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-brand-900 sm:w-40"
                      aria-label={`Watch ${video.title}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/video-thumbs/${video.provider}/${video.externalId}`}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="grid size-9 place-items-center rounded-full bg-black/55 text-white">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 size-4" aria-hidden>
                            <path d="M8 5.5v13l10.5-6.5z" />
                          </svg>
                        </span>
                      </span>
                    </a>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-medium text-ink">{video.title}</p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {video.submittedBy
                          ? `${video.submittedBy.firstName} ${video.submittedBy.lastName}`.trim()
                          : "Club"}
                      </p>
                      <Badge
                        tone={video.status === "approved" ? "success" : "danger"}
                        className="mt-1.5"
                      >
                        {video.status === "approved" ? "Published" : "Rejected"}
                      </Badge>
                    </div>
                    <div className="shrink-0">
                      <ModerateVideo
                        videoId={video.id}
                        status={video.status === "approved" ? "approved" : "rejected"}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}
      </div>
    </AdminShell>
  );
}
