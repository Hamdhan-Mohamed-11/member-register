"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SECTION_GROUPS } from "./navItems";

/**
 * The phone-only row of sibling pages; see SECTION_GROUPS. Renders nothing on
 * a page outside every group, and nothing from lg up, where the sidebar lists
 * every one of these already.
 */
export function SectionTabs() {
  const pathname = usePathname();
  const group = SECTION_GROUPS.find((g) => g.some((item) => item.href === pathname));
  if (!group) return null;

  return (
    <nav
      aria-label="In this section"
      className="-mx-4 mb-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:hidden"
    >
      <ul className="flex w-max gap-2">
        {group.map((item) => {
          const active = item.href === pathname;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`press inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-line bg-surface text-ink-muted hover:text-ink"
                }`}
              >
                <Icon name={item.icon} className="size-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
