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
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {MEMBER_NAV.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-14 text-[11px] ${
                  active ? "text-brand-600 font-medium" : "text-ink-muted"
                }`}
              >
                <NavIcon name={item.label} className="size-6" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
