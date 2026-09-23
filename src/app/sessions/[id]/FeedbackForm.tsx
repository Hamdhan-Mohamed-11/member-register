"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Notice, controlClassName } from "@/components/ui/Field";
import { giveFeedback } from "./actions";
import type { FeedbackKind } from "@/lib/sessions/feedback";

const LABELS = ["Poor", "Fair", "Good", "Great", "Excellent"];

function Stars({
  value,
  onChange,
  name,
}: {
  value: number;
  onChange: (n: number) => void;
  name: string;
}) {
  return (
    // Radio buttons, not a row of divs: a rating is a choice of one from five,
    // and this way it is reachable by keyboard and announced as such.
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">Rating out of five</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label
          key={n}
          className="cursor-pointer p-0.5"
          title={LABELS[n - 1]}
        >
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="sr-only peer"
          />
          <span className="sr-only">
            {n} of 5 — {LABELS[n - 1]}
          </span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className={`size-7 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand-600 ${
              n <= value ? "text-gold-500" : "text-line-strong"
            }`}
            fill={n <= value ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinejoin="round"
          >
            <path d="m12 4.5 2.3 4.9 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 10l5.2-.7z" />
          </svg>
        </label>
      ))}
      {value > 0 ? (
        <span className="ml-2 text-sm text-ink-muted">{LABELS[value - 1]}</span>
      ) : null}
    </fieldset>
  );
}

/**
 * One feedback form: a rating out of five and an optional note.
 *
 * Both forms (the evening, and the person who presented) use this. Saving
 * again replaces the earlier answer rather than adding a second one.
 */
export function FeedbackForm({
  sessionId,
  kind,
  title,
  hint,
  initialRating,
  initialComment,
}: {
  sessionId: string;
  kind: FeedbackKind;
  title: string;
  hint: string;
  initialRating: number;
  initialComment: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const answered = initialRating > 0;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (rating < 1) {
      setError("Choose a rating first.");
      return;
    }
    startTransition(async () => {
      const result = await giveFeedback(sessionId, kind, rating, comment);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-muted">{hint}</p>
      </div>

      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Notice tone="success">Thank you — your feedback is saved.</Notice> : null}

      <Stars value={rating} onChange={setRating} name={`rating-${kind}`} />

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Anything you want to add? (optional)"
        className={controlClassName}
      />

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : answered ? "Update my answer" : "Send"}
      </Button>
    </form>
  );
}
