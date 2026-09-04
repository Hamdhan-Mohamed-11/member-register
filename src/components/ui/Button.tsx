import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
export type ButtonSize = "lg" | "md" | "sm";

// min-h-11 is 44px -- the minimum comfortable touch target. The attendance
// recorder is used one-handed, standing up, so this is not negotiable.
//
// active:scale is not decoration: on a phone there is no hover, so a pressed
// state is the only immediate confirmation that a tap registered.
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap " +
  "transition-[background-color,border-color,box-shadow,transform,color] duration-150 " +
  "active:scale-[0.98] motion-reduce:active:scale-100 " +
  "focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none";

const sizes: Record<ButtonSize, string> = {
  lg: "min-h-12 px-5 text-[0.9375rem]",
  md: "min-h-11 px-4 text-sm",
  sm: "min-h-9 px-3 text-sm",
};

/**
 * Every variant carries a border, including the ones that look borderless.
 *
 * That is what stops buttons reading as plain text -- a `ghost` with no border
 * and no background is indistinguishable from a label until you hover it, and
 * on a touch screen there is no hover. The transparent border also means the
 * box never resizes by a pixel when a variant gains a visible edge on hover.
 */
const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white border border-brand-700 shadow-card " +
    "hover:bg-brand-700 hover:shadow-raised",
  secondary:
    "bg-surface text-brand-700 border border-line-strong shadow-card " +
    "hover:bg-brand-50 hover:border-brand-500",
  ghost:
    "bg-transparent text-ink-muted border border-transparent " +
    "hover:bg-canvas-deep hover:text-ink hover:border-line",
  danger:
    "bg-danger-600 text-white border border-danger-600 shadow-card hover:brightness-110",
  // The one place gold is allowed to be a fill rather than a rule: a single
  // call to action on the marketing page. Dark ink on gold, because white on
  // this yellow fails contrast badly.
  gold:
    "bg-gold-500 text-brand-950 border border-gold-600 shadow-card hover:bg-gold-200",
};

/**
 * Shared class string for anchors that should look like buttons. A <button>
 * cannot be nested inside an <a>, so links use this instead of the component.
 */
export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = "",
): string {
  return `${base} ${sizes[size]} ${variants[variant]} ${className}`;
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={buttonClassName(variant, size, className)}
      {...props}
    />
  );
}
