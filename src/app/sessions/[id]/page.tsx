import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { requireActiveMember } from "@/lib/auth/session";
import { feeForMember, getSession, myBooking } from "@/lib/sessions/queries";
import { formatWhen } from "@/components/sessions/SessionCard";
import { parseVideoUrl } from "@/lib/sessions/video";
import { BookingPanel } from "./BookingPanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession(id);
  return { title: session?.title ?? "Session" };
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await requireActiveMember();
  const { id } = await params;

  const session = await getSession(id);
  if (!session) notFound();

  const [fee, booking] = await Promise.all([
    feeForMember(id, member.userId),
    myBooking(id, member.userId),
  ]);

  const video = parseVideoUrl(session.videoUrl);

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/sessions">Sessions</BackLink>
      </div>

      <div className="space-y-4">
        <Card>
          <h1 className="font-display text-2xl text-ink">{session.title}</h1>
          <p className="text-sm text-ink-muted mt-1">{formatWhen(session.heldAt)}</p>

          <dl className="mt-4 space-y-2 text-sm">
            {session.bookTitle ? (
              <div className="flex gap-2">
                <dt className="text-ink-faint w-20 shrink-0">Book</dt>
                <dd className="text-ink">
                  {session.bookTitle}
                  {session.bookAuthor ? ` · ${session.bookAuthor}` : ""}
                </dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="text-ink-faint w-20 shrink-0">Club</dt>
              <dd className="text-ink">{session.hostClub?.name ?? "—"}</dd>
            </div>
            {session.presenter ? (
              <div className="flex gap-2">
                <dt className="text-ink-faint w-20 shrink-0">Presenter</dt>
                <dd className="text-ink">
                  <Link
                    href={`/members/${session.presenter.id}`}
                    className="text-brand-600 hover:underline"
                  >
                    {`${session.presenter.firstName} ${session.presenter.lastName}`.trim()}
                  </Link>
                </dd>
              </div>
            ) : null}
            {session.location ? (
              <div className="flex gap-2">
                <dt className="text-ink-faint w-20 shrink-0">Where</dt>
                <dd className="text-ink">{session.location}</dd>
              </div>
            ) : null}
          </dl>

          {session.notes ? (
            <p className="text-sm text-ink mt-4 whitespace-pre-line">{session.notes}</p>
          ) : null}
        </Card>

        {video ? (
          <Card flush>
            <div className="p-4 pb-2">
              <CardHeader title="Recording" />
            </div>
            <div className="px-4 pb-4">
              {/* src is CONSTRUCTED from a parsed provider + id, never the
                  pasted string -- see lib/sessions/video.ts. */}
              <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-ink">
                <iframe
                  src={video.embedUrl}
                  title={`${session.title} recording`}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          </Card>
        ) : session.videoUrl ? (
          <Card>
            <CardHeader title="Recording" />
            <a
              href={session.videoUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-sm text-brand-600 hover:underline break-all"
            >
              {session.videoUrl}
            </a>
            <p className="text-xs text-ink-faint mt-1">
              Only YouTube and Vimeo links can be played here.
            </p>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Your place" />
          <BookingPanel
            sessionId={session.id}
            fee={fee}
            booking={booking}
            isPast={session.isPast}
            isCancelled={session.status === "cancelled"}
          />
        </Card>
      </div>
    </AppShell>
  );
}
