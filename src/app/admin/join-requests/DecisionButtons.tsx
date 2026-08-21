"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { approveJoinRequest, rejectJoinRequest } from "./actions";

export function DecisionButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const fd = new FormData();
    fd.set("requestId", requestId);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      // revalidatePath in the action invalidates the server cache, but the
      // already-rendered client tree still holds the decided row. Without this
      // the admin approves someone and watches them sit in the queue, which
      // reads as a failure and invites a second click.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(rejectJoinRequest)}
        >
          Reject
        </Button>
        <Button size="sm" disabled={pending} onClick={() => run(approveJoinRequest)}>
          {pending ? "Working…" : "Approve"}
        </Button>
      </div>
      {error ? <p className="text-xs text-danger-600">{error}</p> : null}
    </div>
  );
}
