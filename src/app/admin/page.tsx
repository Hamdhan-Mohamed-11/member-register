import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { requireSecretary } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin" };

// Landing pages for each admin area. Super-admin-only entries are hidden from
// secretaries -- the pages themselves re-check with requireSuperAdmin(), this
// list only decides what is worth showing.
//
// `ready: false` marks an area that is planned but not built. Rendering it as a
// dead link would send admins to a 404 and make them wonder what they broke;
// showing it greyed out with "coming soon" is honest about the roadmap.
// Grouped, because eleven equal tiles is a wall rather than a menu: the things
// a secretary does weekly should not sit in the same undifferentiated grid as
// the things a super admin touches twice a year.
const AREAS = [
  { href: "/admin/join-requests", label: "Join requests", desc: "Approve public club applications.", superOnly: false, ready: true, icon: "inbox" as const, group: "run" as const },
  { href: "/admin/sessions", label: "Sessions", desc: "Create sessions and record attendance.", superOnly: false, ready: true, icon: "calendar" as const, group: "run" as const },
  { href: "/admin/videos", label: "Videos", desc: "Approve member-submitted recordings.", superOnly: false, ready: true, icon: "play" as const, group: "run" as const },
  { href: "/admin/discover", label: "Discover", desc: "Post photos and video from your events.", superOnly: false, ready: true, icon: "sparkle" as const, group: "run" as const },

  { href: "/admin/clubs", label: "Clubs and types", desc: "Create clubs, group them by type, invite members.", superOnly: true, ready: true, icon: "users" as const, group: "setup" as const },
  { href: "/admin/companies", label: "Companies", desc: "Company clubs and employee onboarding.", superOnly: true, ready: true, icon: "shield" as const, group: "setup" as const },
  { href: "/admin/members", label: "Members", desc: "Roles, membership dates, suspensions.", superOnly: true, ready: true, icon: "id" as const, group: "setup" as const },
  { href: "/admin/settings", label: "Settings", desc: "Fees, terms, discount, points rules.", superOnly: true, ready: true, icon: "pencil" as const, group: "setup" as const },

  { href: "/admin/orders", label: "Book orders", desc: "Confirm prices and fulfil member purchases.", superOnly: true, ready: true, icon: "book" as const, group: "money" as const },
  { href: "/admin/library", label: "Borrow requests", desc: "Issue and return library books.", superOnly: true, ready: true, icon: "bookmark" as const, group: "money" as const },
  { href: "/admin/payments", label: "Payments", desc: "Membership and booking payments.", superOnly: true, ready: true, icon: "card" as const, group: "money" as const },
];

const GROUPS = [
  { id: "run" as const, title: "Running your club", hint: "The week-to-week work." },
  { id: "setup" as const, title: "Setup", hint: "Who exists, and the rules they run under." },
  { id: "money" as const, title: "Books and money", hint: "Orders, borrowing and payments." },
];

export default async function AdminPage() {
  const member = await requireSecretary();
  const isSuper = member.role === "super_admin";
  const areas = AREAS.filter((a) => !a.superOnly || isSuper);

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="font-display text-2xl sm:text-3xl text-ink page-title">Club admin</h1>
        <p className="text-sm text-ink-muted">
          {member.role === "super_admin"
            ? "Signed in as super admin."
            : member.secretaryClubName
              ? `Secretary of ${member.secretaryClubName}. You can act on this club only.`
              : "You are a secretary, but no club has been assigned to you yet."}
        </p>
      </div>

      {/*
        A secretary with no club can reach this page and do nothing on it. Say
        so plainly rather than showing them a grid of areas that will all turn
        them away -- 0027 leaves every existing secretary in exactly this state
        until someone appoints them.
      */}
      {member.role === "secretary" && !member.secretaryClubId ? (
        <Card tone="warning" className="mb-4">
          <p className="text-sm text-ink">
            A super admin needs to appoint you as a club&apos;s secretary before
            you can create sessions or record attendance.
          </p>
        </Card>
      ) : null}

      <div className="space-y-6">
        {GROUPS.map((group) => {
          const inGroup = areas.filter((a) => a.group === group.id);
          if (inGroup.length === 0) return null;
          return (
            <section key={group.id}>
              <h2 className="font-display text-lg text-ink">{group.title}</h2>
              <p className="text-sm text-ink-muted">{group.hint}</p>

              <div className="stagger mt-3 grid gap-3 sm:grid-cols-2">
                {inGroup.map((area) =>
                  area.ready ? (
                    <Link key={area.href} href={area.href} className="block min-w-0">
                      <Card interactive className="press h-full">
                        <div className="flex items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-700">
                            <Icon name={area.icon} className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{area.label}</p>
                            <p className="mt-0.5 text-sm text-ink-muted">{area.desc}</p>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  ) : (
                    <Card key={area.href} className="h-full opacity-60">
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas-deep text-ink-faint">
                          <Icon name={area.icon} className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium text-ink">
                            {area.label}
                            <span className="rounded border border-line px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                              Soon
                            </span>
                          </p>
                          <p className="mt-0.5 text-sm text-ink-muted">{area.desc}</p>
                        </div>
                      </div>
                    </Card>
                  ),
                )}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
