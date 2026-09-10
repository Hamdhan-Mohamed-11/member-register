import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { canAdminClub, requireSecretary } from "@/lib/auth/session";
import { getSession } from "@/lib/sessions/queries";
import { flyerUrl } from "@/lib/flyers/url";
import { formatWhen } from "@/components/sessions/SessionCard";
import { FlyerDesigner } from "./FlyerDesigner";

export const metadata: Metadata = { title: "Flyer" };
export const dynamic = "force-dynamic";

export default async function FlyerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await requireSecretary();
  const { id } = await params;

  const session = await getSession(id);
  if (!session || !session.hostClub) notFound();

  // Same rule as the rest of the session admin: another club's flyer is not
  // this secretary's to make.
  if (!canAdminClub(member, session.hostClub.id)) notFound();

  return (
    <AppShell>
      <BackLink href={`/admin/sessions/${id}`}>Session</BackLink>
      <PageHeader
        className="mt-1"
        title="Make a flyer"
        description="Pick a template, drop in a photo, then download it, share it, or put it in front of members."
      />

      <FlyerDesigner
        session={{
          id: session.id,
          clubName: session.hostClub.name,
          title: session.title,
          bookTitle: session.bookTitle,
          bookAuthor: session.bookAuthor,
          when: formatWhen(session.heldAt),
          location: session.location ?? "",
          presenter: session.presenter
            ? `${session.presenter.firstName} ${session.presenter.lastName}`.trim()
            : "",
          flyerTemplate: session.flyerTemplate,
          flyerUrl: flyerUrl(session.flyerPath),
        }}
      />
    </AppShell>
  );
}
