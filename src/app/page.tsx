import { redirect } from "next/navigation";
import { getSessionMember } from "@/lib/auth/session";

/**
 * No landing page: pickabook.club is the front door, and its buttons link
 * straight to /join or /login. Anyone who lands on the bare portal address
 * goes to the sign-in page, which links on to registration.
 */
export default async function Home() {
  redirect((await getSessionMember()) ? "/home" : "/login");
}
