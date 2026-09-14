"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { adminNavFor, isAdminActive } from "./adminNavItems";

function NavList({
  isSuper,
  onNavigate,
}: {
  isSuper: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="space-y-6">
      {adminNavFor(isSuper).map((group) => (
        <div key={group.title}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-navy-muted/70">
            {group.title}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {group.items.map((item) => {
              const active = isAdminActive(item.href, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`press relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                      active
                        ? "bg-white/12 font-medium text-white"
                        : "text-on-navy-muted hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    {/* A rule on the active item, not colour alone: a shift
                        in text colour on a dark ground is easy to miss. */}
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-400"
                      />
                    ) : null}
                    <Icon name={item.icon} className="size-[18px] shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Admin navigation: a sidebar at lg and up, a drawer below.
 *
 * Not the member bottom bar. Admins and secretaries asked for the admin area
 * to be its own thing, and the member bar's Books / Sessions / Members / Me
 * are the wrong five destinations for someone running a club. The member side
 * is one link away at the foot of the sidebar, not the frame around every
 * admin page.
 */
export function AdminNav({
  isSuper,
  roleLabel,
  clubName,
}: {
  isSuper: boolean;
  roleLabel: string;
  clubName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on navigation, in case a link was followed some way other
  // than tapping it (back button, a link inside the page).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Stop the page scrolling behind an open drawer.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const identity = (
    <div className="rounded-card border border-white/12 bg-white/6 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-sky-300">{roleLabel}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-white">
        {clubName ?? (isSuper ? "All clubs" : "No club assigned")}
      </p>
    </div>
  );

  const footer = (
    <Link
      href="/feed"
      className="press flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-on-navy-muted transition-colors hover:bg-white/8 hover:text-white"
    >
      <Icon name="chevron-right" className="size-[18px] shrink-0 rotate-180" />
      Back to the member site
    </Link>
  );

  return (
    <>
      {/* ---- Desktop sidebar ----------------------------------------- */}
      <aside className="on-navy sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-brand-800 bg-brand-900 px-3 py-5 lg:flex">
        {identity}
        <div className="flex-1">
          <NavList isSuper={isSuper} />
        </div>
        {footer}
      </aside>

      {/* ---- Mobile: a menu button, then a drawer -------------------- */}
      <div className="sticky top-16 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="admin-drawer"
          className="press inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            className="size-5"
            aria-hidden
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          Admin menu
        </button>
        <p className="min-w-0 truncate text-xs text-ink-muted">
          {roleLabel} · {clubName ?? (isSuper ? "all clubs" : "no club")}
        </p>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="reveal-fade absolute inset-0 bg-brand-950/55 backdrop-blur-[2px]"
          />
          <aside
            id="admin-drawer"
            className="on-navy reveal absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 overflow-y-auto bg-brand-900 px-3 py-5 shadow-band"
          >
            <div className="flex items-center justify-between px-1">
              <p className="font-display text-lg text-white">Admin</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="press grid size-9 place-items-center rounded-lg text-on-navy-muted hover:bg-white/10 hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  className="size-5"
                  aria-hidden
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            {identity}
            <div className="flex-1">
              <NavList isSuper={isSuper} onNavigate={() => setOpen(false)} />
            </div>
            {footer}
          </aside>
        </div>
      ) : null}
    </>
  );
}
