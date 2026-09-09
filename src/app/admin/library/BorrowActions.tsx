"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice, controlClassName } from "@/components/ui/Field";
import { setBorrowStatus } from "./actions";

/**
 * The buttons on one borrow request.
 *
 * Which appear depends on where the request already is: a book cannot be
 * returned before it is issued, and offering the move anyway would let a
 * secretary record a return that never happened.
 *
 * The due date is only asked for at the moment of issuing, because that is the
 * only moment it means anything. Left blank the RPC defaults to three weeks.
 */
export function BorrowActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState("");

  function move(next: "approved" | "issued" | "returned" | "rejected") {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", next);
    if (next === "issued" && dueOn) fd.set("dueOn", dueOn);

    startTransition(async () => {
      const result = await setBorrowStatus(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const btn =
    "min-h-9 rounded-lg px-3 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {error ? <Notice>{error}</Notice> : null}

      <div className="flex flex-wrap gap-2 sm:justify-end">
        {status === "requested" ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => move("approved")}
              className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => move("rejected")}
              className={`${btn} border border-line text-danger-600 hover:bg-danger-100`}
            >
              Decline
            </button>
          </>
        ) : null}

        {status === "approved" ? (
          <>
            <input
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
              aria-label="Due back on"
              className={`${controlClassName} w-40 min-h-9 py-1`}
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => move("issued")}
              className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}
            >
              Hand over
            </button>
          </>
        ) : null}

        {status === "issued" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => move("returned")}
            className={`${btn} bg-success-100 text-success-600 hover:bg-success-100/70`}
          >
            Mark returned
          </button>
        ) : null}
      </div>

      {status === "approved" ? (
        <p className="text-[11px] text-ink-faint sm:text-right">
          Blank due date means three weeks.
        </p>
      ) : null}
    </div>
  );
}
