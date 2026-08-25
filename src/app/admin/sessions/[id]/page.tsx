import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";
import { requireSecretary } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getSession } from "@/lib/sessions/queries";
import { getSessionFormOptions, toDatetimeLocal } from "@/lib/sessions/formOptions";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { formatLkr, formatWhen } from "@/components/sessions/SessionCard";
import { SessionForm } from "../SessionForm";

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
  const admin = await requireSecretary();
  const { id } = await params;

  const session = await getSession(id);
  if (!session) notFound();

  const { clubs, members } = await getSessionFormOptions();
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
    <AppShell
      member={{
        firstName: admin.firstName,
        lastName: admin.lastName,
        avatarUrl: avatarUrl(admin.userId, admin.avatarPath),
      }}
    >
      <div className="mb-4">
        <Link href="/admin/sessions" className="text-sm text-brand-600 hover:underline">
          ← Sessions
        </Link>
        <h1 className="font-display text-2xl text-ink mt-1">{session.title}</h1>
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
              <Link
                href={`/admin/sessions/${id}/attendance`}
                className={buttonClassName("primary", "sm")}
              >
                Record
              </Link>
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
              status: session.status,
              videoUrl: session.videoUrl ?? "",
            }}
          />
        </Card>
      </div>
    </AppShell>
  );
}
