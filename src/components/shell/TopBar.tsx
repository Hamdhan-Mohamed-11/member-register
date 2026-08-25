"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { MEMBER_NAV, isActive } from "./navItems";

export type TopBarMember = {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export function TopBar({ member }: { member: TopBarMember | null }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-line">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-4">
        <Link
          href={member ? "/feed" : "/"}
          className="font-display text-xl text-brand-600 shrink-0"
        >
          Pick a Book
        </Link>

        {member ? (
          <>
            {/* Desktop links. On mobile these live in the bottom bar instead. */}
            <nav aria-label="Primary" className="hidden md:block ml-2">
              <ul className="flex items-center gap-1">
                {MEMBER_NAV.map((item) => {
                  const active = isActive(item, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`inline-flex items-center min-h-9 px-3 rounded-lg text-sm ${
                          active
                            ? "bg-brand-50 text-brand-700 font-medium"
                            : "text-ink-muted hover:bg-canvas-deep hover:text-ink"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <Link href="/me" className="ml-auto shrink-0" aria-label="Your profile">
              <Avatar
                src={member.avatarUrl}
                firstName={member.firstName}
                lastName={member.lastName}
                size="sm"
              />
            </Link>
          </>
        ) : (
          <Link
            href="/login"
            className="ml-auto text-sm font-medium text-brand-600"
          >
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
