import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";

// Landing page for signed-out visitors. Once Phase 1 lands, this redirects
// signed-in members straight to /feed.
export default function Home() {
  return (
    <AppShell member={null}>
      <div className="max-w-xl mx-auto text-center py-10">
        <h1 className="text-2xl font-semibold text-ink">
          The Pick a Book member portal
        </h1>
        <p className="mt-3 text-ink-muted">
          Track what you&apos;re reading, see your club&apos;s sessions, earn
          points for taking part, and borrow or buy books at a member discount.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/login" className={buttonClassName("primary")}>
            Log in
          </Link>
          <Link href="/join" className={buttonClassName("secondary")}>
            Join a club
          </Link>
        </div>
      </div>

      <Card className="max-w-xl mx-auto">
        <p className="text-sm text-ink-muted">
          Already a member of a company club? Look for your invite email — it
          has a link to set your password.
        </p>
      </Card>
    </AppShell>
  );
}
