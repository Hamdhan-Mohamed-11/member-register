"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button, buttonClassName } from "@/components/ui/Button";

/**
 * Catches render and data errors anywhere under the app router.
 *
 * Deliberately shows no stack, no error message and no digest beyond the
 * reference: `error.message` from a Server Component is redacted in production
 * anyway, but in development it can carry table names, column names and query
 * text, and there is no good reason for a member's screen to be the place that
 * differs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Stable prefix so this is greppable in the VPS logs, which is where it
    // will actually be diagnosed from.
    console.error("[app:error]", error.digest ?? "(no digest)", error.message);
  }, [error]);

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <Card className="max-w-sm w-full text-center">
        <h1 className="font-display text-2xl text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-muted">
          That page didn&apos;t load. Trying again usually works — if it keeps
          happening, let a club admin know.
        </p>

        {error.digest ? (
          <p className="mt-3 text-xs text-ink-faint">
            Reference <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}

        <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={reset}>Try again</Button>
          <Link href="/feed" className={buttonClassName("secondary")}>
            Go home
          </Link>
        </div>
      </Card>
    </main>
  );
}
