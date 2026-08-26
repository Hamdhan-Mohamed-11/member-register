import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { TopBar, type TopBarMember } from "./TopBar";

/**
 * The signed-in chrome. Takes the member as a prop rather than reading the
 * session itself, so the layout that renders it does the one cached session
 * lookup and this stays a dumb presentational shell.
 *
 * pb-20 on <main> reserves room for the fixed mobile bottom bar; without it the
 * last card on every page sits underneath the nav.
 */
export function AppShell({
  member,
  children,
  wide = false,
}: {
  member: TopBarMember | null;
  children: ReactNode;
  /** Wider container for marketing pages; app pages keep the reading width. */
  wide?: boolean;
}) {
  return (
    <>
      <TopBar member={member} />
      <main className={`flex-1 mx-auto w-full px-4 py-4 pb-20 md:pb-8 ${wide ? "max-w-6xl" : "max-w-5xl"}`}>
        {children}
      </main>
      {member ? <BottomNav /> : null}
    </>
  );
}
