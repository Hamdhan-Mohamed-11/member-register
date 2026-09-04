import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { requireActiveMember } from "@/lib/auth/session";
import { getMemberProfile } from "@/lib/members/queries";
import { ReadingList } from "./ReadingList";

export const metadata: Metadata = { title: "My reading" };

export default async function MyReadingPage() {
  const member = await requireActiveMember();
  const profile = await getMemberProfile(member.userId);

  // Cannot happen -- you can always see yourself -- but treating it as notFound
  // is better than rendering a page built on a null.
  if (!profile) notFound();

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/me">My profile</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">My reading</h1>
      </div>

      <ReadingList items={profile.reading} />
    </AppShell>
  );
}
