"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/shell/Logo";

export type CreatorNavProps = {
  /** "author" | "publisher" -- a publisher additionally has a list of names. */
  kind: "author" | "publisher";
  /** The author's or house's name, as it appears on their books. */
  name: string | null;
  /** Whether a Pick a Book admin has approved them yet. */
  status: "pending" | "approved" | "rejected" | null;
};

type Item = { href: string; label: string; icon: IconName };

function itemsFor(kind: "author" | "publisher"): Item[] {
  return [
    { href: "/creator", label: "My books", icon: "book" },
    ...(kind === "publisher"
      ? [{ href: "/creator/authors", label: "My authors", icon: "users" as IconName }]
      : []),
    { href: "/creator/books/new", label: "Submit a book", icon: "pencil" },
    { href: "/notifications", label: "Notifications", icon: "bell" },
    { href: "/me/edit", label: "Edit profile", icon: "id" },
  ];
}

function isActive(href: string, pathname: string): boolean {
  if (href === "/creator") return pathname === "/creator";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ kind, onNavigate }: { kind: "author" | "publisher"; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Author area">
      <ul className="space-y-0.5">
        {itemsFor(kind).map((item) => {
          const active = isActive(item.href, pathname);
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
    </nav>
  );
}

function Identity({ kind, name, status }: CreatorNavProps) {
  return (
    <div className="rounded-card border border-white/12 bg-white/6 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-sky-300">
        {kind === "publisher" ? "Publisher" : "Author"}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-white">{name ?? "Not registered"}</p>
      {status && status !== "approved" ? (
        <p className="mt-1 text-[11px] text-on-navy-muted">
          {status === "pending" ? "Waiting for approval" : "Not approved"}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The author's sidebar, desktop only.
 *
 * The same navy frame as the admin area rather than the member one, because
 * this is the other kind of account that works IN the portal rather than
 * belonging to a club -- and because the portal's own tab strip left the page
 * looking like a blank document with two links over it.
 */
export function CreatorNav(props: CreatorNavProps) {
  return (
    <aside className="on-navy sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-brand-800 bg-brand-900 lg:flex">
      <Link
        href="/creator"
        className="flex h-16 shrink-0 items-center border-b border-white/10 px-5"
        aria-label="My books"
      >
        <Logo className="h-10 w-auto brightness-0 invert" preload />
      </Link>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5">
        <Identity {...props} />
        <NavList kind={props.kind} />
      </div>
    </aside>
  );
}

/** The same menu on phones: a strip with a button that opens a drawer. */
export function CreatorMobileNav(props: CreatorNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

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

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="creator-drawer"
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
          Menu
        </button>
        <p className="min-w-0 truncate text-xs text-ink-muted">
          {props.kind === "publisher" ? "Publisher" : "Author"}
          {props.name ? ` · ${props.name}` : ""}
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
            id="creator-drawer"
            className="on-navy reveal absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 overflow-y-auto bg-brand-900 px-3 py-5 shadow-band"
          >
            <div className="flex items-center justify-between px-1">
              <p className="font-display text-lg text-white">My books</p>
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
            <Identity {...props} />
            <NavList kind={props.kind} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
