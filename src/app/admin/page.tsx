import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { requireSecretary } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin" };

// Landing pages for each admin area. Super-admin-only entries are filtered out
// for secretaries -- the pages themselves re-check with requireSuperAdmin(),
// this list only decides what is worth showing.
const AREAS = [
  { href: "/admin/sessions", label: "Sessions", desc: "Create sessions and record attendance.", superOnly: false },
  { href: "/admin/videos", label: "Videos", desc: "Approve member-submitted recordings.", superOnly: false },
  { href: "/admin/orders", label: "Book orders", desc: "Fulfil member purchases.", superOnly: false },
  { href: "/admin/library", label: "Borrow requests", desc: "Issue and return library books.", superOnly: false },
  { href: "/admin/members", label: "Members", desc: "Roles, membership dates, suspensions.", superOnly: true },
  { href: "/admin/join-requests", label: "Join requests", desc: "Approve public club applications.", superOnly: true },
  { href: "/admin/invites", label: "Invites", desc: "Invite members and secretaries.", superOnly: true },
  { href: "/admin/companies", label: "Companies", desc: "Company clubs and employee onboarding.", superOnly: true },
  { href: "/admin/settings", label: "Settings", desc: "Fees, terms, discount, points rules.", superOnly: true },
];

export default async function AdminPage() {
  const member = await requireSecretary();
  const isSuper = member.role === "super_admin";
  const areas = AREAS.filter((a) => !a.superOnly || isSuper);

  return (
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: null,
      }}
    >
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-ink">Club admin</h1>
        <p className="text-sm text-ink-muted">
          Signed in as {member.role === "super_admin" ? "super admin" : "secretary"}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map((area) => (
          <Link key={area.href} href={area.href} className="block">
            <Card className="h-full hover:shadow-raised transition-shadow">
              <CardHeader title={area.label} description={area.desc} />
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
