/**
 * The primary navigation, shared by the desktop top bar and the mobile bottom
 * bar so the two can never drift apart. Five items is the practical ceiling for
 * a thumb-reachable bottom bar at 360px.
 */
export type NavItem = {
  href: string;
  label: string;
  /** Also treat these path prefixes as "current" for highlighting. */
  match?: string[];
};

export const MEMBER_NAV: NavItem[] = [
  { href: "/feed", label: "Home" },
  { href: "/sessions", label: "Sessions" },
  { href: "/books", label: "Books", match: ["/books", "/library", "/cart"] },
  { href: "/directory", label: "Members", match: ["/directory", "/members"] },
  { href: "/me", label: "Me", match: ["/me", "/orders", "/renew"] },
];

export function isActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.match ?? [item.href];
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
