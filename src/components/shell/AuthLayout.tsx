import type { ReactNode } from "react";
import { Logo } from "./Logo";

/**
 * The frame for every page that is *about* signing in — log in, join, forgot
 * password, set password, the holding page.
 *
 * These were a centred card on an empty canvas: correct, and the plainest
 * screens in the product, which is unfortunate for the two pages most people
 * see most often. On desktop there is now a brand panel beside the form
 * carrying the words the brand guideline leads with; on a phone that panel is
 * dropped entirely rather than stacked, because nobody scrolls past a quote to
 * reach a password field.
 *
 * The form column keeps its original max-width, so no existing form has to
 * change to sit in here.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Small print under the card — "already have an account?" and friends. */
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-8 py-4 sm:py-8 lg:grid-cols-[1fr_minmax(0,24rem)] lg:items-center lg:gap-12">
      {/* ---- Brand panel: desktop only ---------------------------------- */}
      <aside className="reveal relative hidden overflow-hidden rounded-panel bg-brand-900 p-9 shadow-band lg:block">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(720px 420px at 80% -10%, rgba(0,174,239,0.5), transparent 62%), radial-gradient(520px 320px at 0% 110%, rgba(0,174,239,0.18), transparent 60%)",
          }}
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300">
            Pick a Book
          </p>

          <blockquote className="mt-5 font-display text-2xl leading-[1.25] text-white">
            A life without books is{" "}
            <em className="italic text-sky-300">an unfulfilled life.</em>
          </blockquote>

          <p className="mt-4 max-w-sm text-sm leading-relaxed text-on-navy-muted">
            From within the pages of a book is a wealth of knowledge, life
            lessons and inspiration — where we live the lives of others as we
            find our own feet in the world.
          </p>

          <p className="mt-8 text-[11px] uppercase tracking-[0.18em] text-sky-300">
            #IamaReader · #WeInspireChange
          </p>
        </div>
      </aside>

      {/* ---- The form --------------------------------------------------- */}
      <div className="reveal w-full max-w-sm mx-auto lg:mx-0">
        {/* The mark only shows where the brand panel does not, so the two
            never appear twice on one screen. */}
        <Logo className="mx-auto mb-6 h-9 w-auto lg:hidden" />

        <div className="mb-6 text-center lg:text-left">
          <h1 className="font-display text-2xl text-ink sm:text-3xl">{title}</h1>
          {subtitle ? (
            <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>
          ) : null}
        </div>

        <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
          {children}
        </div>

        {footer ? <div className="mt-5 text-center lg:text-left">{footer}</div> : null}
      </div>
    </div>
  );
}
