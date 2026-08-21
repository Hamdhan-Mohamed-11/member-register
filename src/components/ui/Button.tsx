import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

// min-h-11 is 44px — the minimum comfortable touch target. The attendance
// recorder is used one-handed, standing up, so this is not negotiable.
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";

const sizes: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  sm: "min-h-9 px-3 text-sm",
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-600",
  secondary:
    "bg-brand-50 text-brand-700 hover:bg-brand-100 focus-visible:ring-brand-600",
  ghost:
    "text-ink-muted hover:bg-canvas hover:text-ink focus-visible:ring-brand-600",
  danger:
    "bg-danger-600 text-white hover:brightness-90 focus-visible:ring-danger-600",
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
