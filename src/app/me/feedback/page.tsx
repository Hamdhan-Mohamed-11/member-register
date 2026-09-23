import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireActiveMember } from "@/lib/auth/session";
import { averageRating, getMyPresenterFeedback } from "@/lib/sessions/feedback";
import { CLUB_TZ } from "@/lib/time";

export const metadata: Metadata = { title: "Feedback on my presenting" };
export const dynamic = "force-dynamic";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: CLUB_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * What the room told this member about their presenting, session by session.
 *
 * Names are never shown: the database returns ratings and comments only (see
 * my_presenter_feedback). The club's admin sees the same words with names.
 */
export default async function MyFeedbackPage() {
  await requireActiveMember();
  const rows = await getMyPresenterFeedback();

  const sessions = [...new Map(rows.map((r) => [r.sessionId, r])).keys()].map((sessionId) => {
    const forSession = rows.filter((r) => r.sessionId === sessionId);
    return { sessionId, first: forSession[0], rows: forSession };
  });

  return (
    <AppShell>
      <BackLink href="/me">Me</BackLink>
      <PageHeader
        className="mt-1"
        title="Feedback on my presenting"
        description="From people who were in the room. Nobody's name is shown."
      />

      {rows.length === 0 ? (
        <Card flush>
          <EmptyState
            icon="chat"
            title="Nothing yet"
            description="Once you present a session and the people who came answer the form, it appears here."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {sessions.map(({ sessionId, first, rows: given }) => (
            <Card key={sessionId}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/sessions/${sessionId}`}
                  className="font-display text-lg text-ink hover:text-brand-600"
                >
                  {first.title}
                </Link>
                <p className="text-sm text-ink-muted">
                  {when(first.heldAt)} · {averageRating(given)} / 5 from {given.length}{" "}
                  {given.length === 1 ? "person" : "people"}
                </p>
              </div>

              <ul className="mt-3 space-y-2">
                {given.map((f, i) => (
                  <li key={i} className="rounded-card border border-line p-3">
                    <p className="text-sm font-medium text-gold-700">{f.rating} / 5</p>
                    {f.comment ? (
                      <p className="mt-1 whitespace-pre-line text-sm text-ink">{f.comment}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
