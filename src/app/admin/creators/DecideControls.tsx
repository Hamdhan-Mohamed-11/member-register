"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice, controlClassName } from "@/components/ui/Field";
import { decideCreator } from "./actions";

/**
 * Approve, or decline with a reason.
 *
 * The reason is required to decline -- decide_creator refuses without one --
 * because it is the whole of what the author is told, and "not approved" with
 * no explanation gives them nothing to fix.
 */
export function DecideControls({
  kind,
  id,
  what,
}: {
  kind: "author" | "publisher" | "book";
  id: string;
  /** Named in the confirmation, so an admin sees what they are declining. */
  what: string;
}) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(approve: boolean) {
    setError(null);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("id", id);
    fd.set("approve", approve ? "yes" : "no");
    if (!approve) fd.set("reason", reason);

    startTransition(async () => {
      const result = await decideCreator(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeclining(false);
      setReason("");
      router.refresh();
    });
  }

  if (declining) {
    return (
      <div className="w-full space-y-2 sm:max-w-sm">
        {error ? <Notice>{error}</Notice> : null}
        <label htmlFor={`reason-${id}`} className="block text-sm text-ink-muted">
          Why is {what} not approved?
        </label>
        <textarea
          id={`reason-${id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          className={controlClassName}
          placeholder="They'll see this."
        />
        <div className="flex gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={() => decide(false)}
            disabled={pending || reason.trim().length === 0}
          >
            {pending ? "Sending…" : "Decline"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeclining(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0">
      {error ? (
        <div className="mb-2">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => decide(true)} disabled={pending}>
          {pending ? "Saving…" : "Approve"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDeclining(true)}>
          Decline
        </Button>
      </div>
    </div>
  );
}
