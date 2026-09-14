"use client";

import { useState } from "react";

/**
 * The price filter.
 *
 * Two number boxes and a twin slider, rather than the two bare inputs this
 * replaced. The slider is the fast way to say "somewhere under two thousand";
 * the boxes are the only way to say "exactly 1,450", and dropping either one
 * makes a common intent awkward.
 *
 * Two stacked <input type=range> rather than a slider library: both are real
 * form controls, so they are keyboard operable and screen-reader labelled for
 * free, and the whole filter still submits as a plain GET form with no
 * JavaScript needed to apply it.
 */
export function PriceRange({
  min,
  max,
  ceiling = 20000,
}: {
  min?: string;
  max?: string;
  /** Top of the slider. Above this, members type a number instead. */
  ceiling?: number;
}) {
  const [lo, setLo] = useState(() => clamp(Number(min) || 0, 0, ceiling));
  const [hi, setHi] = useState(() =>
    clamp(Number(max) || ceiling, 0, ceiling),
  );

  /*
    Keep the two handles from crossing, in the setters rather than an effect.

    Pushing rather than blocking: dragging the left handle past the right takes
    the right along with it. Blocking feels broken, because the handle stops
    while the finger keeps going. Doing it here also means there is no render
    where lo > hi, which an effect would briefly allow.
  */
  function setMin(next: number) {
    const v = clamp(next, 0, ceiling);
    setLo(v);
    if (v > hi) setHi(v);
  }

  function setMax(next: number) {
    const v = clamp(next, 0, ceiling);
    setHi(v);
    if (v < lo) setLo(v);
  }

  const loPct = (lo / ceiling) * 100;
  const hiPct = (hi / ceiling) * 100;

  return (
    <div className="rounded-card border border-line bg-canvas p-4">
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Price range
      </p>

      <div className="mt-3 flex items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="block text-xs text-ink-faint">Min</span>
          <input
            type="number"
            name="min_price"
            min={0}
            inputMode="numeric"
            value={lo || ""}
            placeholder="0"
            onChange={(e) => setMin(Number(e.target.value) || 0)}
            className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm tabular-nums text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
          />
        </label>

        <span aria-hidden className="pb-3 text-ink-faint">
          —
        </span>

        <label className="min-w-0 flex-1">
          <span className="block text-xs text-ink-faint">Max</span>
          <input
            type="number"
            name="max_price"
            min={0}
            inputMode="numeric"
            value={hi >= ceiling ? "" : hi}
            placeholder={`${ceiling.toLocaleString("en-LK")}+`}
onChange={(e) => setMax(Number(e.target.value) || ceiling)}
            className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm tabular-nums text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
          />
        </label>
      </div>

      {/*
        The track is a plain div; the two range inputs sit on top of it with
        transparent tracks, so the fill between the handles can be drawn once
        rather than faked per-browser.
      */}
      <div className="relative mt-5 h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-brand-600"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />

        <input
          type="range"
          min={0}
          max={ceiling}
          step={50}
          value={lo}
          aria-label="Minimum price"
          onChange={(e) => setMin(Number(e.target.value))}
          className="price-thumb absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={0}
          max={ceiling}
          step={50}
          value={hi}
          aria-label="Maximum price"
          onChange={(e) => setMax(Number(e.target.value))}
          className="price-thumb absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent"
        />
      </div>

      <p className="mt-2 text-center text-xs text-ink-faint">
        The price you pay, after your member discount.
      </p>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
