import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

// min-h-11 is 44px — the minimum comfortable touch target. The attendance
// recorder is used one-handed, standing up, so this is not negotiable.
// active:scale is not decoration -- on a phone there is no hover, so a pressed
// state is the only immediate confirmation that a tap registered.
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium " +
  "transition-[background-color,box-shadow,transform] duration-150 " +
  "active:scale-[0.98] motion-reduce:active:scale-100 " +
  "focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none";

const sizes: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  sm: "min-h-9 px-3 text-sm",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white shadow-card hover:bg-brand-700",
  secondary:
    "bg-surface text-brand-700 border border-line-strong hover:bg-brand-50 hover:border-brand-500",
  ghost: "text-ink-muted hover:bg-canvas-deep hover:text-ink",
  danger: "bg-danger-600 text-white shadow-card hover:brightness-95",
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
