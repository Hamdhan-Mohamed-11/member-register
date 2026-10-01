"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
import { syncCatalogueNow } from "./actions";

/**
 * Pulls the catalogue from the store on demand.
 *
 * The hourly run keeps it fresh on its own; this is for the moment after
 * somebody changes a price on the store and wants to see it here.
 */
export function SyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await syncCatalogueNow();
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      const d = outcome.data;
      setResult(
        d
          ? `${d.written} books updated from ${d.fetched} in the store` +
              (d.retired > 0 ? `, ${d.retired} no longer listed` : "") +
              `. ${d.withCover} have a cover.`
          : "Done.",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error ? <Notice>{error}</Notice> : null}
      {result ? <Notice tone="success">{result}</Notice> : null}
      <Button onClick={run} disabled={pending}>
        {pending ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}
