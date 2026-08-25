import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { requireActiveMember } from "@/lib/auth/session";
import { avatarUrl, getMemberProfile } from "@/lib/members/queries";
import { ReadingList } from "./ReadingList";

export const metadata: Metadata = { title: "My reading" };

export default async function MyReadingPage() {
  const member = await requireActiveMember();
  const profile = await getMemberProfile(member.userId);

  // Cannot happen -- you can always see yourself -- but treating it as notFound
  // is better than rendering a page built on a null.
  if (!profile) notFound();

  return (
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: avatarUrl(member.userId, member.avatarPath),
      }}
    >
      <div className="mb-4">
        <Link href="/me" className="text-sm text-brand-600 hover:underline">
          ← My profile
        </Link>
        <h1 className="text-2xl font-semibold text-ink mt-1">My reading</h1>
      </div>

      <ReadingList items={profile.reading} />
    </AppShell>
  );
}
