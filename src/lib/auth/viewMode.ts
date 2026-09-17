import "server-only";

import { cookies } from "next/headers";

/**
 * A secretary can step out of the admin area and see their club the way its
 * members do -- the feed, the sessions, Discover -- and step back.
 *
 * A cookie rather than a URL flag, so the choice holds while they click
 * around the member pages. It grants nothing: it only chooses which chrome a
 * secretary sees, and every page still checks the real role. Super admins do
 * not get it at all -- they are not members of any club.
 */
export const MEMBER_VIEW_COOKIE = "pab_member_view";

export async function inMemberView(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(MEMBER_VIEW_COOKIE)?.value === "1";
}
