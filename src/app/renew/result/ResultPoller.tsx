"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { Notice } from "@/components/ui/Field";
import { buttonClassName } from "@/components/ui/Button";

type Status = "pending" | "success" | "manual" | "failed" | "cancelled" | "chargedback";

const POLL_MS = 2000;
const CEILING_MS = 90_000;

/**
 * Shows the outcome of a payment by POLLING the payments row.
 *
 * The return URL is NOT a source of truth. A user can navigate here directly,
 * or close the tab before it loads, and PayHere's browser redirect carries no
 * authority anyway. Status is only ever set by the server-to-server webhook,
 * so this waits for that to land rather than believing the URL it was sent to.
 */
export function ResultPoller({ orderRef }: { orderRef: string }) {
  const [status, setStatus] = useState<Status>("pending");
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    async function poll() {
      if (cancelled) return;

      const supabase = getBrowserSupabaseClient();
      const { data } = await supabase
        .from("payments")
        .select("status")
        .eq("provider_order_ref", orderRef)
        .maybeSingle();

      if (cancelled) return;

      const next = (data?.status ?? "pending") as Status;
      setStatus(next);

      if (next !== "pending") return;

      if (Date.now() - startedAt > CEILING_MS) {
        setTimedOut(true);
        return;
      }
      setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [orderRef]);

  if (status === "success" || status === "manual") {
    return (
      <div className="space-y-3">
        <Notice tone="success">
          Payment received. Your membership is up to date.
        </Notice>
        <Link href="/me" className={buttonClassName("primary")}>
          Back to my profile
        </Link>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="space-y-3">
        <Notice tone="info">Payment cancelled — nothing was charged.</Notice>
        <Link href="/renew" className={buttonClassName("secondary")}>
          Try again
        </Link>
      </div>
    );
  }

  if (status === "failed" || status === "chargedback") {
    return (
      <div className="space-y-3">
        <Notice>
          That payment didn&apos;t go through. Nothing has been charged — please
          try again, or contact the club.
        </Notice>
        <Link href="/renew" className={buttonClassName("secondary")}>
          Try again
        </Link>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="space-y-3">
        {/*
          Deliberately not "your payment failed". If the money left their
          account, saying that is worse than saying nothing -- the webhook may
          simply be slow, and the reference is what support needs.
        */}
        <Notice tone="info">
          We haven&apos;t had confirmation yet. If you completed the payment it
          will appear shortly — quote reference <strong>{orderRef}</strong> if
          you need to ask about it.
        </Notice>
        <Link href="/me" className={buttonClassName("secondary")}>
          Back to my profile
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-muted">Confirming your payment…</p>
      <p className="text-xs text-ink-faint">Reference {orderRef}</p>
    </div>
  );
}
