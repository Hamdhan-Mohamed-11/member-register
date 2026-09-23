"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice, controlClassName } from "@/components/ui/Field";
import { decideClubRequest } from "./actions";

/**
 * Approve — which creates the club — or decline with a reason.
 *
 * Approving is armed first, because it is not a decision that can be taken
 * back with another click: the club exists afterwards, and the applicant is
 * its admin.
 */
export function DecideClub({ id, clubName }: { id: string; clubName: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "approving" | "declining">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(approve: boolean) {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("approve", approve ? "yes" : "no");
    if (!approve) fd.set("reason", reason);

    startTransition(async () => {
      const result = await decideClubRequest(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("idle");
      setReason("");
      router.refresh();
    });
  }

  if (mode === "approving") {
    return (
      <div className="w-full space-y-2 sm:max-w-sm">
        {error ? <Notice>{error}</Notice> : null}
        <p className="text-sm text-ink-muted">
          Create {clubName} and make the applicant its club admin? It starts
          private, so nobody can apply to it until they open it.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => decide(true)} disabled={pending}>
            {pending ? "Creating…" : "Create the club"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "declining") {
    return (
      <div className="w-full space-y-2 sm:max-w-sm">
        {error ? <Notice>{error}</Notice> : null}
        <label htmlFor={`reason-${id}`} className="block text-sm text-ink-muted">
          Why is {clubName} not approved?
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
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")}>
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
        <Button size="sm" onClick={() => setMode("approving")}>
          Approve
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setMode("declining")}>
          Decline
        </Button>
      </div>
    </div>
  );
}
