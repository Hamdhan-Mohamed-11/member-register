import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClassName } from "@/components/ui/Button";
import { SessionCard } from "@/components/sessions/SessionCard";
import { requireSecretary } from "@/lib/auth/session";
import { listAllSessions } from "@/lib/sessions/queries";

export const metadata: Metadata = { title: "Sessions · Admin" };

export default async function AdminSessionsPage() {
  await requireSecretary();
  const sessions = await listAllSessions();

  return (
    <AppShell>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <BackLink href="/admin">Admin</BackLink>
          <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">Sessions</h1>
          <p className="text-sm text-ink-muted">
            Create sessions and record attendance as they happen.
          </p>
        </div>
        <Link href="/admin/sessions/new" className={buttonClassName("primary", "sm")}>
          New session
        </Link>
      </div>

      {sessions.length === 0 ? (
        <Card flush>
          <EmptyState
            title="No sessions yet"
            description="Create one to start recording attendance and points."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} href={`/admin/sessions/${s.id}`} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
