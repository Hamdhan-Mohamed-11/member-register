"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
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

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Record as paid
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {error ? <Notice>{error}</Notice> : null}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this being settled by hand?"
        className="w-full min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-600"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || reason.trim().length < 3} onClick={submit}>
          {pending ? "Saving…" : "Confirm"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
