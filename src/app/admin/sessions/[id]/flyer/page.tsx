import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { canAdminClub, requireStaff } from "@/lib/auth/session";
import { getSession } from "@/lib/sessions/queries";
import { flyerUrl } from "@/lib/flyers/url";
import { listBooks } from "@/lib/legacy/books";
import { FlyerDesigner } from "./FlyerDesigner";

export const metadata: Metadata = { title: "Flyer" };

/**
 * The session's date broken into the parts the templates set separately --
 * the day as a big numeral, the month in small caps. In Colombo time,
 * explicitly: this runs on the server, whose own clock is not the club's.
 */
function dateParts(iso: string) {
  const parts = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", ...options }).format(
      new Date(iso),
    );
  return {
    day: parts({ day: "numeric" }),
    month: parts({ month: "short" }).replace(".", ""),
    monthLong: parts({ month: "long" }),
    weekday: parts({ weekday: "long" }),
    weekdayShort: parts({ weekday: "short" }),
    year: parts({ year: "numeric" }),
    time: parts({ hour: "numeric", minute: "2-digit", hour12: true })
      .replace(/\s?([ap])\.?m\.?/i, " $1m")
      .toLowerCase(),
  };
}
export const dynamic = "force-dynamic";

export default async function FlyerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await requireStaff();
  const { id } = await params;

  const session = await getSession(id);
  if (!session || !session.hostClub) notFound();

  // Same rule as the rest of the session admin: another club's flyer is not
  // this secretary's to make.
  if (!canAdminClub(member, session.hostClub.id)) notFound();

  // The shop's cover for this book, when the shop has it: one search on the
  // title, and the flyer maker needs nothing filled in. An uploaded cover
  // (saved on the session) wins, because someone chose it deliberately.
  let catalogueBookId: number | null = null;
  if (!session.bookImagePath && session.bookTitle.trim()) {
    const found = await listBooks({ search: session.bookTitle.trim(), page: 1 });
    if (found.ok) {
      const match = found.data.books.find((b) => b.imageUrl);
      catalogueBookId = match ? match.id : null;
    }
  }

  return (
    <AdminShell>
      <BackLink href={`/admin/sessions/${id}`}>Session</BackLink>
      <PageHeader
        className="mt-1"
        title="Make a flyer"
        description="Pick a template, add a photo and drag it into place, then download it, share it, or put it in front of members."
      />

      <FlyerDesigner
        session={{
          id: session.id,
          clubName: session.hostClub.name,
          title: session.title,
          bookTitle: session.bookTitle,
          bookAuthor: session.bookAuthor,
          date: dateParts(session.heldAt),
          location: session.location ?? "",
          presenter: session.presenter
            ? `${session.presenter.firstName} ${session.presenter.lastName}`.trim()
            : "",
          flyerTemplate: session.flyerTemplate,
          flyerUrl: flyerUrl(session.flyerPath),
          bookImageUrl: flyerUrl(session.bookImagePath),
          catalogueBookId,
          sponsorUrl: flyerUrl(session.sponsorPath),
          sponsorName: session.sponsorName ?? "",
        }}
      />
    </AdminShell>
  );
}
