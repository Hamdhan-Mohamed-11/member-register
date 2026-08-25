"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { Notice } from "@/components/ui/Field";

/**
 * Completes an email link -- signup confirmation, invite, or password
 * recovery.
 *
 * This runs on the CLIENT, and it has to, because Supabase can return the
 * session two different ways:
 *
 *   ?code=...              PKCE, readable by a server route
 *   #access_token=...      implicit, in the URL FRAGMENT
 *
 * A fragment is never sent to the server. The previous version of this was a
 * server route handler, so every implicit-flow link -- which is what the
 * signup confirmation email actually produces -- arrived with nothing readable
 * and was rejected as "missing_code". Handling both here means the flow works
 * whichever form Supabase chooses.
 */
export function CallbackHandler({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function complete() {
      const supabase = getBrowserSupabaseClient();

      // The fragment form. Read it before anything clears it, and strip it
      // from the address bar afterwards so the tokens are not left sitting in
      // history or copied out of the URL bar.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: setError_ } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", window.location.pathname);
        if (cancelled) return;
        if (setError_) {
          setError("That link has expired. Please request a new one.");
          return;
        }
        router.replace(next);
        router.refresh();
        return;
      }

      // The PKCE form.
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          setError("That link has expired or was already used. Please request a new one.");
          return;
        }
        router.replace(next);
        router.refresh();
        return;
      }

      // Supabase reports its own failures in the query string.
      const params = new URLSearchParams(window.location.search);
      const supabaseError =
        params.get("error_description") || params.get("error") || hash.get("error_description");
      setError(
        supabaseError
          ? decodeURIComponent(supabaseError)
          : "That link is missing its sign-in details. Please request a new one.",
      );
    }

    void complete();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  if (error) {
    return (
      <div className="space-y-3">
        <Notice>{error}</Notice>
        <p className="text-sm text-ink-muted">
          You can{" "}
          <a href="/forgot-password" className="text-brand-600 hover:underline">
            request a new link
          </a>{" "}
          or{" "}
          <a href="/login" className="text-brand-600 hover:underline">
            log in
          </a>
          .
        </p>
      </div>
    );
  }

  return <p className="text-sm text-ink-muted">Signing you in…</p>;
}
