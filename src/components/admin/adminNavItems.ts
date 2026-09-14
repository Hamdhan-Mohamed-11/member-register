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
export type AdminNavItem = {
  href: string;
  label: string;
  icon: IconName;
  superOnly: boolean;
};

export type AdminNavGroup = {
  title: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: "Running your club",
    items: [
      { href: "/admin", label: "Dashboard", icon: "sparkle", superOnly: false },
      { href: "/admin/sessions", label: "Sessions", icon: "calendar", superOnly: false },
      { href: "/admin/join-requests", label: "Join requests", icon: "inbox", superOnly: false },
      { href: "/admin/videos", label: "Videos", icon: "play", superOnly: false },
      { href: "/admin/discover", label: "Discover", icon: "id", superOnly: false },
    ],
  },
  {
    title: "People and setup",
    items: [
      { href: "/admin/clubs", label: "Clubs and types", icon: "users", superOnly: true },
      { href: "/admin/companies", label: "Companies", icon: "shield", superOnly: true },
      { href: "/admin/members", label: "Members", icon: "id", superOnly: true },
      { href: "/admin/settings", label: "Settings", icon: "pencil", superOnly: true },
    ],
  },
  {
    title: "Books and money",
    items: [
      { href: "/admin/orders", label: "Book orders", icon: "book", superOnly: true },
      { href: "/admin/library", label: "Borrow requests", icon: "bookmark", superOnly: true },
      { href: "/admin/payments", label: "Payments", icon: "card", superOnly: true },
    ],
  },
];

export function adminNavFor(isSuper: boolean): AdminNavGroup[] {
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => isSuper || !item.superOnly),
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
