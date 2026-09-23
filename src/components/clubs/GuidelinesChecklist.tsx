"use client";

import { useState } from "react";

/**
 * The club guidelines, one tick box each.
 *
 * Every line has to be ticked before an application can be sent. They are
 * listed separately rather than behind a single "I agree to the guidelines"
 * box because the point is that someone reads them -- and because the club
 * wanted the applicant to have said yes to each one, not to a link.
 *
 * The parent owns nothing but the resulting boolean: request_club_join
 * refuses an application that does not carry it, so this is the prompt and
 * the database is the rule.
 */
export function GuidelinesChecklist({
  guidelines,
  onChange,
  className = "",
}: {
  guidelines: string[];
  onChange: (allAccepted: boolean) => void;
  className?: string;
}) {
  const [ticked, setTicked] = useState<boolean[]>(() => guidelines.map(() => false));

  if (!guidelines.length) return null;

  function toggle(index: number, checked: boolean) {
    const next = ticked.map((was, i) => (i === index ? checked : was));
    setTicked(next);
    onChange(next.every(Boolean));
  }

  const remaining = ticked.filter((t) => !t).length;

  return (
    <div className={`rounded-xl border border-line bg-canvas p-3 sm:p-4 ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">Before you join</p>
        <button
          type="button"
          onClick={() => {
            const next = guidelines.map(() => true);
            setTicked(next);
            onChange(true);
          }}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          Tick all
        </button>
      </div>

      <ul className="space-y-2">
        {guidelines.map((line, index) => (
          <li key={line}>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-ink-muted">
              <input
                type="checkbox"
                checked={ticked[index] ?? false}
                onChange={(e) => toggle(index, e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong text-brand-600 focus:ring-brand-500"
              />
              <span>{line}</span>
            </label>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-ink-faint" aria-live="polite">
        {remaining === 0
          ? "Thank you — you can send your application."
          : `${remaining} left to tick.`}
      </p>
    </div>
  );
}
