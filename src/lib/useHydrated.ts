"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True only once React has hydrated on the client.
 *
 * Credential forms use this to keep their submit button disabled until the
 * onSubmit handler is actually attached. Without it there is a window --
 * short on localhost, long on a slow connection -- where the form is visible
 * and clickable but inert, so the browser performs a NATIVE submit instead.
 *
 * For a login form that means the email and password go into the URL as a
 * query string, where they land in nginx access logs, browser history and any
 * Referer header. That was happening in production and is exactly the kind of
 * thing that never shows up in local testing.
 *
 * useSyncExternalStore rather than useState + useEffect: it gives a different
 * server and client snapshot by design, with no extra render and no
 * setState-during-effect.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,   // client
    () => false,  // server
  );
}
