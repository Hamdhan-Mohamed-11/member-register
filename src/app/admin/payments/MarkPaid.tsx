"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice, controlClassName } from "@/components/ui/Field";
import { markPaid } from "./actions";

export function MarkPaid({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("paymentId", paymentId);
    fd.set("reason", reason);

    startTransition(async () => {
      const result = await markPaid(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  // The button sits in the row's right column under the status; the reason
  // box opens as a small panel beneath it rather than pushing the row apart.
  return (
    <div className="relative">
      <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Record as paid
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[80vw] space-y-2 rounded-card border border-line bg-surface p-3 shadow-band">
          {error ? <Notice>{error}</Notice> : null}
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Why is this being settled by hand?"
            className={controlClassName}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending || reason.trim().length < 3} onClick={submit}>
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
