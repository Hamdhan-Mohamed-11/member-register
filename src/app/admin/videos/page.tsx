import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { VideoCard } from "@/components/videos/VideoCard";
import { ModerateVideo } from "@/app/videos/VideoActions";
import { requireSecretary } from "@/lib/auth/session";
import { listForModeration } from "@/lib/videos/queries";

export const metadata: Metadata = { title: "Videos · Admin" };

export default async function AdminVideosPage() {
  await requireSecretary();
  const { pending, recent } = await listForModeration();

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/admin">Admin</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">Videos</h1>
        <p className="text-sm text-ink-muted">
          Member submissions are visible only to them until published here.
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
                  <ModerateVideo videoId={video.id} />
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
                  description="For context — reject something published here if it needs pulling."
                />
              </div>
              <ul className="divide-y divide-line">
                {recent.map((video) => (
                  <li
                    key={video.id}
                    className="px-4 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">{video.title}</p>
                      <p className="text-xs text-ink-faint">
                        {video.submittedBy
                          ? `${video.submittedBy.firstName} ${video.submittedBy.lastName}`.trim()
                          : "Club"}
                        {" · "}
                        {video.status}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <ModerateVideo videoId={video.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
