const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-20 text-xl",
} as const;

export type AvatarSize = keyof typeof sizes;

function initials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return (a + b).toUpperCase() || "?";
}

/**
 * Avatars live in a PRIVATE storage bucket — `src` is expected to be the
 * `/api/avatars/[profileId]` route, which performs the visibility check before
 * redirecting to a short-lived signed URL. Never point this at a public bucket
 * URL: that would make company-club members' photos enumerable by uuid and
 * quietly defeat the directory visibility rule.
 *
 * A plain <img>, not next/image — the route 307s to a Supabase-signed host and
 * next/image would need it in remotePatterns.
 */
export function Avatar({
  src,
  firstName = "",
  lastName = "",
  size = "md",
  className = "",
}: {
  src?: string | null;
  firstName?: string;
  lastName?: string;
  size?: AvatarSize;
  className?: string;
}) {
  const shell = `${sizes[size]} rounded-full shrink-0 ${className}`;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`${firstName} ${lastName}`.trim() || "Member"}
        loading="lazy"
        decoding="async"
        className={`${shell} object-cover bg-brand-100`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${shell} bg-brand-100 text-brand-700 font-semibold grid place-items-center select-none`}
    >
      {initials(firstName, lastName)}
    </span>
  );
}
