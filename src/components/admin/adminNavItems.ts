import type { IconName } from "@/components/ui/Icon";

/**
 * The admin navigation.
 *
 * One list, consumed by the desktop sidebar and the mobile drawer, so the two
 * cannot drift apart — the same reason `navItems.ts` exists for the member
 * side.
 *
 * `superOnly` is presentation, not security: every page re-checks with
 * requireSuperAdmin(), and every RPC behind them checks again. Hiding an item
 * a secretary cannot use is about not offering a door that will be shut in
 * their face.
 */
/**
 * The least senior staff role that gets this item.
 *
 *   secretary  -- the club's day-to-day work
 *   club_admin -- deciding for one club: its members, its money
 *   super      -- everything central: clubs, companies, settings, the library
 */
export type AdminNavLevel = "secretary" | "club_admin" | "super";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: IconName;
  level: AdminNavLevel;
};

export type AdminNavGroup = {
  title: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: "Running your club",
    items: [
      { href: "/admin", label: "Dashboard", icon: "sparkle", level: "secretary" },
      { href: "/admin/sessions", label: "Sessions", icon: "calendar", level: "secretary" },
      { href: "/admin/join-requests", label: "Join requests", icon: "inbox", level: "club_admin" },
      { href: "/admin/videos", label: "Videos", icon: "play", level: "secretary" },
      { href: "/admin/discover", label: "Discover", icon: "id", level: "secretary" },
    ],
  },
  {
    title: "People and setup",
    items: [
      { href: "/admin/clubs", label: "Clubs and types", icon: "users", level: "super" },
      { href: "/admin/club-requests", label: "Club applications", icon: "inbox", level: "super" },
      { href: "/admin/companies", label: "Companies", icon: "shield", level: "super" },
      { href: "/admin/members", label: "Members", icon: "id", level: "club_admin" },
      { href: "/admin/settings", label: "Settings", icon: "pencil", level: "super" },
    ],
  },
  {
    title: "Books and money",
    items: [
      { href: "/admin/orders", label: "Book orders", icon: "book", level: "super" },
      { href: "/admin/creators", label: "Authors and publishers", icon: "pencil", level: "super" },
      { href: "/admin/library", label: "Borrow requests", icon: "bookmark", level: "super" },
      { href: "/admin/payments", label: "Payments", icon: "card", level: "club_admin" },
    ],
  },
];

const RANK: Record<AdminNavLevel, number> = { secretary: 0, club_admin: 1, super: 2 };

export function adminNavFor(role: string): AdminNavGroup[] {
  const mine = role === "super_admin" ? 2 : role === "club_admin" ? 1 : 0;
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => RANK[item.level] <= mine),
  })).filter((group) => group.items.length > 0);
}

/**
 * Whether a nav item is the current page.
 *
 * /admin is an exact match on purpose: as a prefix it would light up for every
 * page in the area, so the dashboard would always look current.
 */
export function isAdminActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
