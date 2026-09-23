import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";
import { adminClubScope, canAdminClub, requireStaff } from "@/lib/auth/session";
import { getSession } from "@/lib/sessions/queries";
import { getSessionFormOptions, toDatetimeLocal } from "@/lib/sessions/formOptions";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { formatLkr, formatWhen } from "@/components/sessions/SessionCard";
import { SessionForm } from "../SessionForm";
import { averageRating, getSessionFeedback } from "@/lib/sessions/feedback";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession(id);
  return { title: session ? `${session.title} · Admin` : "Session" };
}

export default async function AdminSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await requireStaff();
  const { id } = await params;

  const session = await getSession(id);
  if (!session) notFound();

  // A secretary may read any session -- sessions_select has always allowed
  // that -- but the admin view of one is an editing screen, and offering it
  // for a club they cannot act on only leads to a refusal on save.
  if (!canAdminClub(member, session.hostClub?.id ?? null)) notFound();

  const { clubs, members } = await getSessionFormOptions(adminClubScope(member));

  // RLS returns feedback only to the club's admin, so a secretary opening
  // this page simply sees nothing here.
  const feedback = session.isPast ? await getSessionFeedback(id) : [];
  const aboutSession = feedback.filter((f) => f.kind === "session");
  const aboutPresenter = feedback.filter((f) => f.kind === "presenter");
  const supabase = await getServerComponentSupabase();

  const [{ count: bookingCount }, { count: activityCount }] = await Promise.all([
    supabase
      .from("session_bookings")
      .select("id", { count: "exact", head: true })
      .eq("session_id", id)
      .in("status", ["pending_payment", "confirmed"]),
    supabase
      .from("member_activities")
      .select("id", { count: "exact", head: true })
      .eq("session_id", id),
  ]);

  return (
    <AdminShell>
      <div className="mb-4">
        <BackLink href="/admin/sessions">Sessions</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1 page-title">{session.title}</h1>
        <p className="text-sm text-ink-muted">
          {formatWhen(session.heldAt)} · {session.hostClub?.name}
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Attendance and points"
            description={
              activityCount
                ? `${activityCount} ${activityCount === 1 ? "entry" : "entries"} recorded.`
                : "Nothing recorded yet."
            }
            action={
              <div className="flex gap-2">
                <Link
                  href={`/admin/sessions/${id}/flyer`}
                  className={buttonClassName("secondary", "sm")}
                >
                  {session.flyerPath ? "Edit flyer" : "Make a flyer"}
                </Link>
                <Link
                  href={`/admin/sessions/${id}/attendance`}
                  className={buttonClassName("primary", "sm")}
                >
                  Record
                </Link>
              </div>
            }
          />
          <p className="text-sm text-ink-muted">
            {bookingCount ?? 0} {bookingCount === 1 ? "person has" : "people have"} booked
            a place.
            {session.pricingKind === "paid" && session.guestFeeLkr
              ? ` Guests from other clubs pay ${formatLkr(session.guestFeeLkr)}.`
              : " This session is free for everyone."}
          </p>
        </Card>

        <Card>
          <CardHeader title="Session details" />
          <SessionForm
            clubs={clubs}
            members={members}
            defaults={{
              sessionId: session.id,
              hostClubId: session.hostClub?.id ?? clubs[0]?.id ?? "",
              title: session.title,
              bookTitle: session.bookTitle,
              bookAuthor: session.bookAuthor,
              heldAtLocal: toDatetimeLocal(session.heldAt),
              location: session.location ?? "",
              notes: session.notes ?? "",
              presenter: session.presenter?.id ?? "",
              pricingKind: session.pricingKind,
              guestFee: session.guestFeeLkr != null ? String(session.guestFeeLkr) : "",
              capacity: session.capacity != null ? String(session.capacity) : "",
              presenterCount:
                session.presenterCount != null ? String(session.presenterCount) : "",
              status: session.status,
              videoUrl: session.videoUrl ?? "",
              imagePath: session.imagePath,
              label: session.label ?? "",
              tagline: session.tagline ?? "",
              highlights: session.highlights,
            }}
          />
        </Card>

        {feedback.length > 0 ? (
          <Card>
            <CardHeader
              title="Feedback"
              description="From the people recorded as attending. The presenter sees their own, without names."
            />

            <div className="grid gap-5 sm:grid-cols-2">
              {[
                { label: "The session", rows: aboutSession },
                { label: "The presenter", rows: aboutPresenter },
              ].map(({ label, rows }) => (
                <div key={label}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                    {label}
                  </p>
                  <p className="mt-1 font-display text-2xl text-ink">
                    {averageRating(rows) ?? "—"}
                    <span className="text-base text-ink-muted">
                      {" "}
                      / 5 · {rows.length} {rows.length === 1 ? "answer" : "answers"}
                    </span>
                  </p>

                  <ul className="mt-3 space-y-2">
                    {rows
                      .filter((r) => r.comment)
                      .map((r, i) => (
                        <li key={i} className="rounded-card border border-line p-3">
                          <p className="text-sm text-ink-muted">
                            <span className="font-medium text-ink">
                              {r.member
                                ? `${r.member.firstName} ${r.member.lastName}`.trim()
                                : "A member"}
                            </span>{" "}
                            · {r.rating} / 5
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm text-ink">{r.comment}</p>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
