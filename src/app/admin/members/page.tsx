import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice, controlClassName } from "@/components/ui/Field";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export const metadata: Metadata = { title: "Members · Admin" };

const ROLE_LABEL: Record<string, string> = {
  member: "Member",
  secretary: "Secretary",
  super_admin: "Super admin",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  rejected: "neutral",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSuperAdmin();
  const { q } = await searchParams;
  const supabase = await getServerComponentSupabase();

  let query = supabase
    .from("admin_members")
    .select("*")
    .order("first_name", { ascending: true });

  if (q?.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`,
    );
  }

  const { data, error } = await query;
  const members = data ?? [];

  return (
    <AppShell>
      <div className="mb-4">
        <BackLink href="/admin">Admin</BackLink>
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">Members</h1>
        <p className="text-sm text-ink-muted">
          {members.length} {members.length === 1 ? "account" : "accounts"}.
        </p>
      </div>

      {/* A plain GET form: search survives a refresh, is linkable, and needs no
          client JavaScript. */}
      <form method="get" className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or email…"
          className={controlClassName}
        />
      </form>

      {error ? (
        <Card>
          <Notice>Couldn&apos;t load members: {error.message}</Notice>
        </Card>
      ) : members.length === 0 ? (
        <Card flush>
          <EmptyState
            title={q ? "Nobody matches that" : "No members yet"}
            description={q ? undefined : "Members appear here once they join."}
          />
        </Card>
      ) : (
        <Card flush>
          <ul className="divide-y divide-line">
            {members.map((m) => {
              const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
              return (
                <li key={m.id}>
                  <Link
                    href={`/admin/members/${m.id}`}
                    className="block px-4 py-3 hover:bg-canvas"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">
                          {name || m.email}
                          {m.role !== "member" ? (
                            <Badge tone="brand" className="ml-2">
                              {ROLE_LABEL[m.role ?? "member"]}
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-sm text-ink-muted truncate">{m.email}</p>
                        <p className="text-xs text-ink-faint mt-0.5">
                          {m.active_clubs ?? 0}{" "}
                          {m.active_clubs === 1 ? "club" : "clubs"} ·{" "}
                          {m.points_balance ?? 0} points · renews{" "}
                          {formatDate(m.next_renewal)}
                        </p>
                      </div>
                      <Badge
                        tone={STATUS_TONE[m.status ?? ""] ?? "neutral"}
                        className="shrink-0"
                      >
                        {m.status}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
