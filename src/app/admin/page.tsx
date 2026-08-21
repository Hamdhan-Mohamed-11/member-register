import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { requireSecretary } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin" };

// Landing pages for each admin area. Super-admin-only entries are hidden from
// secretaries -- the pages themselves re-check with requireSuperAdmin(), this
// list only decides what is worth showing.
//
// `ready: false` marks an area that is planned but not built. Rendering it as a
// dead link would send admins to a 404 and make them wonder what they broke;
// showing it greyed out with "coming soon" is honest about the roadmap.
const AREAS = [
  { href: "/admin/join-requests", label: "Join requests", desc: "Approve public club applications.", superOnly: false, ready: true },
  { href: "/admin/companies", label: "Companies", desc: "Company clubs and employee onboarding.", superOnly: true, ready: true },
  { href: "/admin/sessions", label: "Sessions", desc: "Create sessions and record attendance.", superOnly: false, ready: true },
  { href: "/admin/videos", label: "Videos", desc: "Approve member-submitted recordings.", superOnly: false, ready: true },
  { href: "/admin/orders", label: "Book orders", desc: "Fulfil member purchases.", superOnly: false, ready: false },
  { href: "/admin/library", label: "Borrow requests", desc: "Issue and return library books.", superOnly: false, ready: false },
  { href: "/admin/members", label: "Members", desc: "Roles, membership dates, suspensions.", superOnly: true, ready: true },
  { href: "/admin/invites", label: "Invites", desc: "Invite members and secretaries.", superOnly: true, ready: false },
  { href: "/admin/payments", label: "Payments", desc: "Membership and booking payments.", superOnly: true, ready: true },
  { href: "/admin/settings", label: "Settings", desc: "Fees, terms, discount, points rules.", superOnly: true, ready: true },
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
        {areas.map((area) =>
          area.ready ? (
            <Link key={area.href} href={area.href} className="block">
              <Card className="h-full hover:shadow-raised transition-shadow">
                <CardHeader title={area.label} description={area.desc} />
              </Card>
            </Link>
          ) : (
            <Card key={area.href} className="h-full opacity-60">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {area.label}
                    <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint border border-line rounded px-1.5 py-0.5">
                      Soon
                    </span>
                  </span>
                }
                description={area.desc}
              />
            </Card>
          ),
        )}
      </div>
    </AppShell>
  );
}
