"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
import { formatLkr } from "@/components/sessions/SessionCard";
import { Icon } from "@/components/ui/Icon";
import { bookSession, cancelBooking } from "./actions";
import type { MyBooking } from "@/lib/sessions/queries";

export function BookingPanel({
  sessionId,
  fee,
  booking,
  isPast,
  isCancelled,
}: {
  sessionId: string;
  fee: number;
  booking: MyBooking | null;
  isPast: boolean;
  isCancelled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fields: Record<string, string>,
  ) {
    setError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  if (isCancelled) {
    return <Notice tone="info">This session was cancelled.</Notice>;
  }

  if (booking && booking.status !== "cancelled") {
    return (
      <div className="space-y-3">
        {error ? <Notice>{error}</Notice> : null}

        {booking.status === "confirmed" ? (
          <Notice tone="success">
            You have a place at this session
            {booking.feeLkr > 0 ? ` (${formatLkr(booking.feeLkr)} paid)` : ""}.
          </Notice>
        ) : (
          <Notice tone="info">
            Your place is held pending payment of {formatLkr(booking.feeLkr)}.
            Online payment is coming soon — please settle with the club.
          </Notice>
        )}

        {!isPast ? (
          <Button
            variant="secondary"
            disabled={pending}
            className="w-full border-danger-600/40 text-danger-600 hover:border-danger-600 hover:bg-danger-100"
            onClick={() =>
              run(cancelBooking, { bookingId: booking.id, sessionId })
            }
          >
            {pending ? "Cancelling…" : "Cancel my place"}
          </Button>
        ) : null}
      </div>
    );
  }

  if (isPast) {
    return <p className="text-sm text-ink-muted">This session has already happened.</p>;
  }

  // The price is shown large just above this panel, so it is not repeated
  // here -- only on the button, where it is what the tap commits to.
  return (
    <div className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}

      <Button
        size="lg"
        disabled={pending}
        onClick={() => run(bookSession, { sessionId })}
        className="w-full gap-2"
      >
        {pending ? "Booking…" : fee === 0 ? "Book my place" : `Book · ${formatLkr(fee)}`}
        {pending ? null : <Icon name="arrow-right" className="size-4" />}
      </Button>
    </div>
  );
}
