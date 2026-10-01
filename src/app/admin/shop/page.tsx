import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader, Stat } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { isStoreConfigured } from "@/lib/store/books";
import { CLUB_TZ, relativeTime } from "@/lib/time";
import { SyncButton } from "./SyncButton";

export const metadata: Metadata = { title: "Shop catalogue" };
export const dynamic = "force-dynamic";

export default async function ShopCataloguePage() {
  await requireSuperAdmin();
  const supabase = await getServerComponentSupabase();

  const { data } = await supabase.rpc("store_catalogue_status");
  const status = (
    (data ?? []) as unknown as {
      total: number | string;
      in_stock: number | string;
      with_cover: number | string;
      retired: number | string;
      last_synced: string | null;
    }[]
  )[0];

  const total = Number(status?.total ?? 0);
  const lastSynced = status?.last_synced ?? null;
  const storeUrl = process.env.PAB_STORE_URL?.trim() ?? "";

  return (
    <AdminShell>
      <div className="mb-4">
        <BackLink href="/admin">Admin</BackLink>
        <h1 className="page-title mt-1 font-display text-2xl text-ink sm:text-3xl">
          Shop catalogue
        </h1>
        <p className="text-sm text-ink-muted">
          The books members buy. Kept here as a copy of the PaB Store&apos;s own
          catalogue, so the shop keeps working whatever happens to the store.
        </p>
      </div>

      <div className="space-y-4">
        {!isStoreConfigured() ? (
          <Notice>
            No store is configured, so the shop is falling back to the old
            catalogue. Set PAB_STORE_URL on the server.
          </Notice>
        ) : null}

        {total === 0 ? (
          <Notice tone="info">
            Nothing has been synced yet. Press Sync now to pull the catalogue
            in for the first time.
          </Notice>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <Card>
            <Stat label="Books" value={total.toLocaleString("en-LK")} />
          </Card>
          <Card>
            <Stat
              label="In stock"
              value={Number(status?.in_stock ?? 0).toLocaleString("en-LK")}
            />
          </Card>
          <Card>
            <Stat
              label="With a cover"
              value={Number(status?.with_cover ?? 0).toLocaleString("en-LK")}
            />
          </Card>
          <Card>
            <Stat
              label="No longer listed"
              value={Number(status?.retired ?? 0).toLocaleString("en-LK")}
              tone="ink"
            />
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Where it comes from"
            description="The store publishes the same catalogue file its own shop reads."
          />
          <dl className="mt-1 space-y-1.5 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-ink-muted">Store</dt>
              <dd className="font-medium text-ink">{storeUrl || "not set"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-ink-muted">Last synced</dt>
              <dd className="font-medium text-ink">
                {lastSynced
                  ? `${relativeTime(lastSynced)} · ${new Date(lastSynced).toLocaleString("en-GB", {
                      timeZone: CLUB_TZ,
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "never"}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-ink-muted">
            Syncs on its own every hour. Books the store stops listing are kept
            and marked, never deleted — an order from last month still has to
            know what it was for.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SyncButton />
            <Link href="/admin/shop/books" className={buttonClassName("secondary", "md")}>
              Edit books and covers
            </Link>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
