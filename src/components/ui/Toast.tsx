"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A one-off confirmation along the bottom of the screen, shown after a
 * redirect -- "Added to cart" once Buy has taken the member to the cart.
 *
 * Driven by a query parameter rather than client state, because the thing that
 * wants to say it (the Buy button) is on a page that has already gone. On
 * mount it strips the parameter back out, so a reload or a shared link does not
 * announce it a second time -- with the native history API, NOT router.replace:
 * a router navigation re-renders the server page without the parameter, and
 * that page no longer renders this toast, so it vanished the instant it arrived.
 *
 * Sits above the phone's bottom bar, and is a polite live region so a screen
 * reader hears it without losing its place.
 */
export function Toast({ message, durationMs = 3200 }: { message: string; durationMs?: number }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    window.history.replaceState(null, "", pathname);
    const timer = window.setTimeout(() => setVisible(false), durationMs);
    return () => window.clearTimeout(timer);
    // Once, on arrival. Re-running on pathname would strip a later visit too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8"
    >
      {visible ? (
        <div className="toast-in pointer-events-auto flex items-center gap-2.5 rounded-full bg-brand-900 py-2.5 pl-3 pr-4 text-sm font-medium text-white shadow-band">
          <span className="grid size-6 place-items-center rounded-full bg-success-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
              aria-hidden
            >
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          {message}
        </div>
      ) : null}
    </div>
  );
}
