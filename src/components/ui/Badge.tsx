import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "gold";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-canvas-deep text-ink-muted",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-100 text-success-600",
  warning: "bg-warning-100 text-warning-600",
  danger: "bg-danger-100 text-danger-600",
  gold: "bg-gold-100 text-gold-700",
};

/**
 * A status pill.
 *
 * Statuses were previously coloured TEXT -- green "Active", red "Expired" --
 * which puts the entire meaning in the hue. The pill gives the same word a
 * shape and a background, so it reads as a status before the colour says which
 * one, and still works for anyone who cannot separate the two reds from the
 * greens.
 */
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
