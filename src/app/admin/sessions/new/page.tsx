import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireSecretary } from "@/lib/auth/session";
import { getSessionFormOptions } from "@/lib/sessions/formOptions";
import { SessionForm } from "../SessionForm";

export const metadata: Metadata = { title: "New session" };

export default async function NewSessionPage() {
  await requireSecretary();
  const { clubs, members } = await getSessionFormOptions();

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/admin/sessions">Sessions</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">New session</h1>
      </div>

      <Card>
        {clubs.length === 0 ? (
          <EmptyState
            title="No clubs yet"
            description="A session has to belong to a club. Create one first."
          />
        ) : (
          <SessionForm
            clubs={clubs}
            members={members}
            defaults={{
              sessionId: null,
              hostClubId: clubs[0].id,
              title: "",
              bookTitle: "",
              bookAuthor: "",
              heldAtLocal: "",
              location: "",
              notes: "",
              presenter: "",
              pricingKind: "free",
              guestFee: "",
              capacity: "",
              status: "scheduled",
              videoUrl: "",
            }}
          />
        )}
      </Card>
    </AppShell>
  );
}
