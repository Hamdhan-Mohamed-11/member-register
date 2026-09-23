"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { withdrawBook } from "./actions";

/**
 * Takes a book off sale.
 *
 * Two clicks, because it is the one control here that changes what members
 * see. Nothing is deleted -- the book keeps its sales history and a super
 * admin can still see it -- so there is no stronger confirmation than this.
 */
export function WithdrawButton({ bookId, title }: { bookId: number; title: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function withdraw() {
    setError(null);
    startTransition(async () => {
      const result = await withdrawBook(bookId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setArmed(false);
      router.refresh();
    });
  }

  if (!armed) {
    return (
      <div className="self-center">
        <Button variant="ghost" size="sm" onClick={() => setArmed(true)}>
          Withdraw
        </Button>
        {error ? <p className="mt-1 text-xs text-danger-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="self-center text-right">
      <p className="mb-1 text-xs text-ink-muted">Take {title} off sale?</p>
      <div className="flex gap-2">
        <Button variant="danger" size="sm" onClick={withdraw} disabled={pending}>
          {pending ? "Withdrawing…" : "Withdraw"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
          Keep
        </Button>
      </div>
      {error ? <p className="mt-1 text-xs text-danger-600">{error}</p> : null}
    </div>
  );
}
