import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClassName } from "@/components/ui/Button";
import { DiscoverCard } from "@/components/discover/DiscoverCard";
import { isAdmin, requireActiveMember } from "@/lib/auth/session";
import { getDiscoverFeed } from "@/lib/discover/queries";

export const metadata: Metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const member = await requireActiveMember();
  const posts = await getDiscoverFeed({ limit: 24 });

  return (
    <AppShell>
      <PageHeader
        title="Discover"
        description="Photos and video from club events, posted by the people running them."
        action={
          <div className="flex gap-2">
            <Link href="/discover/saved" className={buttonClassName("secondary", "sm")}>
              Saved
            </Link>
            {isAdmin(member) ? (
              <Link href="/admin/discover" className={buttonClassName("primary", "sm")}>
                Post
              </Link>
            ) : null}
          </div>
        }
      />

      {posts.length === 0 ? (
        <Card flush>
          <EmptyState
            icon="sparkle"
            title="Nothing here yet"
            description="When your club posts photos or video from an event, it appears here."
          />
        </Card>
      ) : (
        // One column. This is photos and video of people, and a two-up grid
        // shrinks faces to thumbnails on the device most members are holding.
        <div className="space-y-4 max-w-xl">
          {posts.map((post) => (
            <DiscoverCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
