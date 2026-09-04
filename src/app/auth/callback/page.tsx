import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { CallbackHandler } from "./CallbackHandler";

export const metadata: Metadata = { title: "Signing you in" };

/**
 * Landing point for every Supabase Auth email link.
 *
 * A PAGE rather than a route handler: the session can arrive in the URL
 * fragment, which never reaches the server. See CallbackHandler.
 */
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Same-origin relative paths only. This page is reachable by anyone holding
  // a link, so an unchecked `next` is an open redirect.
  const target =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/feed";

  return (
    <AppShell signedOut>
      <div className="max-w-sm mx-auto pt-10">
        <Card>
          <CallbackHandler next={target} />
        </Card>
      </div>
    </AppShell>
  );
}
