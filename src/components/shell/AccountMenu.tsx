"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { accountItemsFor } from "./accountItems";

export type AccountMenuMember = {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  pointsBalance: number;
  isAdmin: boolean;
};

/**
 * The avatar dropdown. Everything that used to sit in a loose row of buttons at
 * the bottom of /me -- points, videos, renewal, sign out -- is reachable from
 * here on every page instead of only from the profile.
 *
 * Written by hand rather than pulled from a headless library: it is one menu,
 * and the four things a library would give us (escape, outside click, focus
 * return, expanded state) are each two lines.
 */
export function AccountMenu({ member }: { member: AccountMenuMember }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape must put focus back on the trigger. Leaving it on a button that
      // no longer exists drops a keyboard user at the top of the document.
      buttonRef.current?.focus();
    }

    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }

    // `focusin` covers tabbing out of the panel, which a pointer listener
    // cannot see.
    function onFocusIn(event: FocusEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  const name = `${member.firstName} ${member.lastName}`.trim() || "Your account";
  const items = accountItemsFor(member.isAdmin);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-canvas-deep"
      >
        <Avatar
          src={member.avatarUrl}
          firstName={member.firstName}
          lastName={member.lastName}
          size="sm"
        />
        <span className="sr-only">Your account</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`size-3.5 text-ink-faint transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Your account"
          className="absolute right-0 top-full mt-2 w-64 origin-top-right rounded-card border border-line bg-surface shadow-raised overflow-hidden z-50"
        >
          <div className="px-4 py-3 bg-canvas border-b border-line">
            <p className="font-medium text-ink truncate">{name}</p>
            <p className="text-xs text-ink-muted truncate">{member.email}</p>
          </div>

          <ul className="py-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  // Closing here rather than in an effect on the pathname: the
                  // layout stays mounted across a client-side navigation, so
                  // the panel would otherwise hang over the page you just
                  // moved to. This is the event that actually means "done".
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 min-h-11 text-sm text-ink hover:bg-brand-50 hover:text-brand-700"
                >
                  <Icon name={item.icon} className="size-[18px] text-ink-faint" />
                  <span className="flex-1">{item.label}</span>
                  {item.hint === "points" ? (
                    <span className="text-xs font-medium text-brand-600">
                      {member.pointsBalance}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          <form action="/auth/signout" method="post" className="border-t border-line">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-3 px-4 min-h-11 text-sm text-danger-600 hover:bg-danger-100"
            >
              <Icon name="power" className="size-[18px]" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
