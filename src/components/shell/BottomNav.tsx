"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MEMBER_NAV, isActive } from "./navItems";
import { NavIcon } from "./NavIcon";

/**
 * Mobile-only bottom bar. Hidden at md+, where the top bar carries the same
 * links. `pb-[env(safe-area-inset-bottom)]` keeps it clear of the iOS home
 * indicator, which otherwise sits on top of the last row of tap targets.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {MEMBER_NAV.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-16 text-[11px] transition-colors ${
                  active ? "text-brand-600 font-medium" : "text-ink-muted"
                }`}
              >
                {/*
                  A rule at the top of the active tab, not just a colour change.
                  Colour alone was the only thing separating the current tab
                  from the other four, at 11px, on a phone in daylight.
                */}
                <span
                  aria-hidden="true"
                  className={`absolute top-0 h-0.5 w-8 rounded-full transition-colors ${
                    active ? "bg-brand-600" : "bg-transparent"
                  }`}
                />
                <span
                  className={`grid place-items-center rounded-full px-3 py-0.5 transition-colors ${
                    active ? "bg-brand-50" : ""
                  }`}
                >
                  <NavIcon name={item.label} className="size-[22px]" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
