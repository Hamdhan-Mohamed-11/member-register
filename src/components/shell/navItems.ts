/**
 * The primary navigation, shared by the desktop top bar and the mobile bottom
 * bar so the two can never drift apart. Five items is the practical ceiling for
 * a thumb-reachable bottom bar at 360px.
 */
import type { IconName } from "@/components/ui/Icon";

export type NavItem = {
  href: string;
  label: string;
  /** Also treat these path prefixes as "current" for highlighting. */
  match?: string[];
};

export type SidebarItem = NavItem & { icon: IconName };

export const MEMBER_NAV: NavItem[] = [
  { href: "/feed", label: "Home" },
  { href: "/sessions", label: "Sessions", match: ["/sessions", "/videos", "/discover"] },
  { href: "/books", label: "Books", match: ["/books", "/library", "/cart"] },
  { href: "/directory", label: "Members", match: ["/directory", "/members", "/leaderboard"] },
  { href: "/me", label: "Me", match: ["/me", "/orders", "/renew"] },
];

/**
 * The desktop sidebar's list.
 *
 * Longer than the bottom bar's five because it has the room: Discover and
 * Recordings get their own entries (review item 14) instead of hiding behind
 * buttons on other pages, and the library and leaderboard stop being
 * sub-pages you had to know existed.
 */
export const SIDEBAR_NAV: SidebarItem[] = [
  { href: "/feed", label: "Home", icon: "home" },
  { href: "/sessions", label: "Sessions", icon: "calendar" },
  { href: "/discover", label: "Discover", icon: "sparkle" },
  { href: "/videos", label: "Recordings", icon: "film" },
  { href: "/books", label: "Books", icon: "book", match: ["/books", "/cart", "/orders"] },
  { href: "/library", label: "Library", icon: "bookmark" },
  { href: "/directory", label: "Members", icon: "users", match: ["/directory", "/members"] },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
  { href: "/me", label: "Me", icon: "id", match: ["/me", "/renew"] },
];

export function isActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.match ?? [item.href];
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
