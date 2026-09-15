"use client";

import { useState } from "react";

const SIZES = {
  sm: "w-10 h-14 rounded-md",
  md: "w-14 h-20 rounded-lg",
  lg: "w-20 h-28 rounded-lg",
} as const;

/**
 * A small book cover for lists -- cart lines, orders, wishlists, reading.
 *
 * Falls back to a lettered placeholder when there is no image, and ALSO when
 * the image fails to load: a good share of the legacy shop's files are gone,
 * and a broken-image icon in a list reads as the page being broken.
 */
export function BookCover({
  src,
  title,
  size = "md",
  className = "",
}: {
  src: string | null | undefined;
  title: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = `relative shrink-0 overflow-hidden border border-line bg-canvas shadow-card ${SIZES[size]} ${className}`;

  if (!src || failed) {
    const initial = title.trim().charAt(0).toUpperCase() || "?";
    return (
      <div
        aria-hidden
        className={`${box} grid place-items-center bg-linear-to-br from-brand-50 to-brand-100`}
      >
        <span className="font-display text-lg text-brand-600">{initial}</span>
        <span className="absolute inset-y-0 left-1 w-px bg-brand-200" />
      </div>
    );
  }

  return (
    <div className={box}>
      {/* Plain <img>: see BookCard for why these covers skip next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

