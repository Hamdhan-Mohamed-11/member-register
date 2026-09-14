import { redirect } from "next/navigation";
import { getSessionMember, isAdmin } from "@/lib/auth/session";

/**
 * Where "home" is, decided once.
 *
 * Admins and secretaries land on the dashboard, members on their feed. Every
 * "go home" in the product -- after logging in, after an invite, from the
 * signed-out landing page -- points here rather than at /feed, so the rule
 * lives in one place instead of being re-derived at each.
 *
 * /feed is NOT blocked for admins. A secretary is usually also a member of the
 * club they run, and "Back to the member site" takes them there deliberately.
 * This only changes where they arrive by default.
 */
export default async function Home() {
  const member = await getSessionMember();
  if (!member) redirect("/login");
  if (member.status !== "active") redirect("/pending");
  redirect(isAdmin(member) ? "/admin" : "/feed");
}
