"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
import type { ActionResult, CheckoutPayload } from "./actions";

/**
 * Starts a payment and hands the browser to PayHere's hosted checkout.
 *
 * The fields are built and SIGNED on the server, then posted from a hidden
 * auto-submitting form. Nothing about the amount is decided here -- the client
 * only knows which club or booking to pay for.
 *
 * A real form POST rather than fetch + redirect, because PayHere's checkout
 * expects form-encoded fields and cross-origin navigation, not an API call.
 */
export function PayButton({
  action,
  fields,
  label,
  variant = "primary",
  disabled,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<CheckoutPayload | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function start() {
    setError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);

    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCheckout(result.data);
      // Submit after React has rendered the hidden inputs. requestAnimationFrame
      // rather than a timeout: it fires after paint, so the form definitely
      // exists, without guessing at a delay.
      requestAnimationFrame(() => formRef.current?.submit());
    });
  }

  return (
    <div className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}

      <Button variant={variant} disabled={pending || disabled} onClick={start}>
        {pending ? "Taking you to PayHere…" : label}
      </Button>

      {checkout ? (
        <form ref={formRef} method="post" action={checkout.action} className="hidden">
          {Object.entries(checkout.fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} readOnly />
          ))}
        </form>
      ) : null}
    </div>
  );
}
