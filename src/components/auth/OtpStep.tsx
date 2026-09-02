"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Notice } from "@/components/ui/Field";
import { useHydrated } from "@/lib/useHydrated";

/**
 * Deliberately a range, not an exact length. GoTrue's `otp_length` is per
 * deployment -- 6 locally, 8 on the hosted project -- so a client-side
 * equality check on the length would reject the real codes outright. Auth
 * decides whether a code is right; this only screens out obvious typos.
 */
const CODE_PATTERN = /^\d{4,12}$/;
const MAX_CODE_LENGTH = 12;
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * The "enter the code we emailed you" step, shared by signup confirmation and
 * password recovery. Both send a GoTrue email OTP and both then call
 * verifyOtp; only the type and where the member lands afterwards differ, so
 * those are the callbacks.
 *
 * `onVerify` and `onResend` resolve to an error message, or null for success.
 */
export function OtpStep({
  email,
  submitLabel,
  onVerify,
  onResend,
  onBack,
  backLabel = "Use a different email",
}: {
  email: string;
  submitLabel: string;
  onVerify: (code: string) => Promise<string | null>;
  onResend: () => Promise<string | null>;
  onBack?: () => void;
  backLabel?: string;
}) {
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  // One interval for the whole step, stopping at zero rather than being
  // recreated on every tick.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!CODE_PATTERN.test(code)) {
      setError("Please enter the code from your email — digits only.");
      return;
    }

    setBusy(true);
    const message = await onVerify(code);
    if (message) {
      setError(message);
      setBusy(false);
      return;
    }
    // Success navigates away; leave the button disabled rather than flashing
    // back to its idle state during the redirect.
  }

  async function resend() {
    setError(null);
    setStatus(null);
    setBusy(true);

    const message = await onResend();
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setStatus("We've sent a new code. The previous one no longer works.");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {status ? <Notice tone="success">{status}</Notice> : null}

      <p className="text-sm text-ink-muted">
        We emailed a code to <strong className="text-ink">{email}</strong>. It expires in 10
        minutes.
      </p>

      <Field
        label="Verification code"
        name="code"
        // Not type="number": that strips leading zeros and shows spinners.
        // inputMode gets the numeric keypad on a phone without either.
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={MAX_CODE_LENGTH}
        required
        placeholder="Code from your email"
        autoFocus
      />

      <Button type="submit" disabled={busy || !hydrated} className="w-full">
        {busy ? "Checking…" : submitLabel}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={resend}
          disabled={busy || cooldown > 0 || !hydrated}
          className="text-brand-600 hover:underline disabled:text-ink-faint disabled:no-underline"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
        {onBack ? (
          <button type="button" onClick={onBack} className="text-brand-600 hover:underline">
            {backLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
