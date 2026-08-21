"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
import { deleteVideo, moderateVideo } from "./actions";

function useVideoAction() {
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
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return { pending, error, run };
}

/** Shown on the submitter's own list, for pending submissions only. */
export function WithdrawVideo({ videoId }: { videoId: string }) {
  const { pending, error, run } = useVideoAction();

  return (
    <div>
      {error ? <Notice>{error}</Notice> : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(deleteVideo, { videoId })}
      >
        {pending ? "Removing…" : "Withdraw"}
      </Button>
    </div>
  );
}

export function ModerateVideo({ videoId }: { videoId: string }) {
  const { pending, error, run } = useVideoAction();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div className="space-y-2">
      {error ? <Notice>{error}</Notice> : null}

      {rejecting ? (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why? The member sees this."
            className="w-full min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => run(moderateVideo, { videoId, status: "rejected", note })}
            >
              {pending ? "Saving…" : "Confirm rejection"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(moderateVideo, { videoId, status: "approved" })}
          >
            {pending ? "Working…" : "Publish"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
