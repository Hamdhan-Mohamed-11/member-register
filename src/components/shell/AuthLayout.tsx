import type { ReactNode } from "react";
import { AuthShowcase } from "./AuthShowcase";

/**
 * The frame for every page that is *about* signing in — log in, join, forgot
 * password, set password, the holding page.
 *
 * One large rounded card on a soft brand-tinted ground: the form on the left,
 * sitting straight on the card, and an illustrated panel inset on the right
 * with the club's lines rotating over it. On a phone the picture becomes a
 * short banner across the top of the card, so it still says "Pick a Book"
 * without pushing the password field below the fold.
 *
 * The form column keeps a readable measure, so no existing form has to change
 * to sit in here.
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
  /** Small print under the form — "already have an account?" and friends. */
  footer?: ReactNode;
}) {
  return (
    <div className="relative -mx-4 -my-5 px-3 py-6 sm:mx-0 sm:my-0 sm:px-0 sm:py-8">
      {/* Soft brand glow behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 500px at 15% 0%, rgba(0,174,239,0.14), transparent 60%), radial-gradient(800px 500px at 100% 100%, rgba(41,56,150,0.14), transparent 60%)",
        }}
      />

      <div className="reveal mx-auto grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-line bg-surface p-2.5 shadow-band sm:p-3 lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Picture: a banner on a phone, the right half on a desktop. */}
        <div className="h-44 sm:h-52 lg:order-2 lg:h-auto">
          <AuthShowcase />
        </div>

        {/* Form */}
        <div className="flex items-center justify-center px-3 py-7 sm:px-8 sm:py-10 lg:order-1 lg:px-12">
          <div className="w-full max-w-sm">
            <div className="mb-7 text-center lg:text-left">
              <h1 className="font-display text-3xl text-ink sm:text-4xl">{title}</h1>
              {subtitle ? (
                <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>
              ) : null}
            </div>

            {children}

            {footer ? <div className="mt-6 text-center lg:text-left">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
