"use client";

import { useEffect, useState } from "react";

/**
 * The picture side of the sign-in card: an illustrated dusk scene in the
 * brand's colours, with the club's own lines rotating over it.
 *
 * Drawn in SVG rather than a photo -- nothing to license, nothing to load,
 * and it stays sharp at any size. The lines are the club's own messaging, not
 * quotes attributed to someone, so there is nothing to get wrong.
 *
 * Rotates every seven seconds unless the visitor has asked for reduced
 * motion, and the arrows let anyone step through by hand.
 */
const SLIDES = [
  {
    eyebrow: "Pick a Book",
    text: "A life without books is an unfulfilled life.",
  },
  {
    eyebrow: "Club evenings",
    text: "Read the book, then tell the room what you found.",
  },
  {
    eyebrow: "Read and Rise",
    text: "Every book you buy through the club sends one to a school.",
  },
];

function Scene() {
  return (
    <svg
      viewBox="0 0 400 600"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="auth-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#10174a" />
          <stop offset="0.45" stopColor="#293896" />
          <stop offset="0.78" stopColor="#3f8fd6" />
          <stop offset="1" stopColor="#8ad8f5" />
        </linearGradient>
        <radialGradient id="auth-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f9cd59" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f9cd59" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="auth-hill-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b5fc4" />
          <stop offset="1" stopColor="#2a3a99" />
        </linearGradient>
        <linearGradient id="auth-hill-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2878" />
          <stop offset="1" stopColor="#10174a" />
        </linearGradient>
      </defs>

      <rect width="400" height="600" fill="url(#auth-sky)" />

      {/* Stars */}
      {[
        [40, 60, 1.4],
        [95, 120, 1],
        [150, 45, 1.6],
        [210, 95, 1],
        [60, 190, 1.2],
        [330, 60, 1.3],
        [370, 140, 1],
        [250, 30, 1.1],
        [120, 250, 0.9],
        [355, 250, 1],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.75} />
      ))}

      {/* Moon with a glow */}
      <circle cx="290" cy="185" r="110" fill="url(#auth-glow)" />
      <circle cx="290" cy="185" r="44" fill="#f9cd59" />
      <circle cx="306" cy="175" r="40" fill="#f2cf7a" opacity="0.35" />

      {/* Birds */}
      <path
        d="M92 300q8-7 14 0q6-7 14 0"
        stroke="#dbe8ff"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M130 275q6-5 10 0q4-5 10 0"
        stroke="#dbe8ff"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />

      {/* Everything on the ground sits a little high, so the lowest third is
          plain dark ground for the caption to sit on. */}
      <g transform="translate(0 -95)">
        {/* Hills */}
        <path
          d="M0 400 C 70 350 140 360 200 385 S 330 350 400 370 V600 H0Z"
          fill="url(#auth-hill-far)"
        />
        <path
          d="M0 455 C 90 410 180 430 250 455 S 360 430 400 445 V600 H0Z"
          fill="url(#auth-hill-near)"
        />
        <path d="M0 520 C 120 490 260 500 400 515 V600 H0Z" fill="#0c1240" />

        {/* A stack of books, bottom right, with an open one on top */}
        <g transform="translate(212 452)">
          <rect x="0" y="62" width="150" height="26" rx="4" fill="#f8f2e9" />
          <rect x="0" y="62" width="14" height="26" fill="#c9982a" />
          <rect x="10" y="36" width="138" height="26" rx="4" fill="#00aeef" />
          <rect x="126" y="36" width="10" height="26" fill="#0284c7" />
          <rect x="4" y="12" width="142" height="24" rx="4" fill="#293896" />
          <rect x="18" y="20" width="60" height="3" rx="1.5" fill="#f2cf7a" />
          {/* Open book */}
          <path d="M75 12 C 55 -8 22 -8 6 -2 V 10 C 22 4 55 4 75 12Z" fill="#fffaf2" />
          <path d="M75 12 C 95 -8 128 -8 144 -2 V 10 C 128 4 95 4 75 12Z" fill="#f3ead9" />
          <path d="M75 12 V -4" stroke="#c9982a" strokeWidth="1.5" />
        </g>

        {/* A little tree, left */}
        <g transform="translate(58 420)" fill="#0c1240">
          <rect x="-3" y="30" width="6" height="40" />
          <circle cx="0" cy="22" r="22" />
          <circle cx="-14" cy="34" r="14" />
          <circle cx="14" cy="34" r="14" />
        </g>
      </g>
      <rect y="500" width="400" height="100" fill="#0c1240" />
    </svg>
  );
}

export function AuthShowcase() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 7000);
    return () => window.clearInterval(timer);
  }, []);

  const slide = SLIDES[index];
  const step = (delta: number) => setIndex((i) => (i + delta + SLIDES.length) % SLIDES.length);

  return (
    <div className="relative h-full min-h-full overflow-hidden rounded-[22px] bg-brand-900">
      <Scene />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-950/85 via-brand-950/40 to-transparent px-5 pb-4 pt-12 sm:px-8 sm:pb-8 lg:pt-24">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300">
          {slide.eyebrow}
        </p>
        <p
          key={index}
          aria-live="polite"
          className="reveal-fade mt-1.5 font-display text-lg leading-snug text-white sm:text-xl lg:mt-2 lg:text-3xl"
        >
          {slide.text}
        </p>
        <div className="mt-3 hidden items-center gap-3 sm:flex lg:mt-5">
          {(
            [
              [-1, "Previous", "m15 6-6 6 6 6"],
              [1, "Next", "m9 6 6 6-6 6"],
            ] as const
          ).map(([delta, label, d]) => (
            <button
              key={label}
              type="button"
              onClick={() => step(delta)}
              aria-label={label}
              className="press grid size-9 place-items-center rounded-full border border-white/40 text-white hover:bg-white/15"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
                aria-hidden
              >
                <path d={d} />
              </svg>
            </button>
          ))}
          <span className="ml-1 flex gap-1.5" aria-hidden>
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/45"
                }`}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
