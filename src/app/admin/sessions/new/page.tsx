import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireSecretary } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getSessionFormOptions } from "@/lib/sessions/formOptions";
import { SessionForm } from "../SessionForm";

export const metadata: Metadata = { title: "New session" };

export default async function NewSessionPage() {
  const admin = await requireSecretary();
  const { clubs, members } = await getSessionFormOptions();

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
        <h1 className="font-display text-3xl text-ink mt-1">New session</h1>
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
