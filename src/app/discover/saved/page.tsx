import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClassName } from "@/components/ui/Button";
import { DiscoverCard } from "@/components/discover/DiscoverCard";
import { requireActiveMember } from "@/lib/auth/session";
import { getDiscoverFeed } from "@/lib/discover/queries";

export const metadata: Metadata = { title: "Saved" };
export const dynamic = "force-dynamic";

export default async function SavedDiscoverPage() {
  await requireActiveMember();
  const posts = await getDiscoverFeed({ limit: 60, savedOnly: true });

  return (
    <AppShell>
      <BackLink href="/discover">Discover</BackLink>
      <PageHeader
        className="mt-1"
        title="Saved"
        description="Only you can see this list."
      />

      {posts.length === 0 ? (
        <Card flush>
          <EmptyState
            icon="inbox"
            title="Nothing saved yet"
            description="Tap Save on anything in Discover and it lands here."
            action={
              <Link href="/discover" className={buttonClassName("secondary", "sm")}>
                Open Discover
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4 max-w-xl">
          {posts.map((post) => (
            <DiscoverCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
