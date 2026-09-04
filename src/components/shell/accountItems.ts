import type { IconName } from "@/components/ui/Icon";

/**
 * The account menu, shared by the avatar dropdown in the top bar and the
 * settings list on /me -- the same reason `navItems.ts` exists. Two places
 * render these; only one place decides what they are.
 *
 * Sign out is NOT in this list. It is a POST to /auth/signout, not a link, and
 * folding it in would mean every consumer had to special-case one entry.
 */
export type AccountItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Shown on the right of the row on /me. */
  hint?: "points" | "videos";
  /** Only render for admins. */
  adminOnly?: boolean;
};

export const ACCOUNT_ITEMS: AccountItem[] = [
  { href: "/me/edit", label: "Edit profile", icon: "pencil" },
  { href: "/me/points", label: "My points", icon: "star", hint: "points" },
  { href: "/me/videos", label: "My videos", icon: "play" },
  { href: "/me/reading", label: "My reading list", icon: "inbox" },
  { href: "/renew", label: "Renew or join a club", icon: "refresh" },
  { href: "/directory", label: "Browse members", icon: "users" },
  { href: "/admin", label: "Admin area", icon: "shield", adminOnly: true },
];

export function accountItemsFor(isAdmin: boolean): AccountItem[] {
  return ACCOUNT_ITEMS.filter((item) => !item.adminOnly || isAdmin);
}
