/**
 * The app's icon set. Hand-rolled and inline, for the same reason as
 * `NavIcon`: a dozen glyphs do not justify an icon package, and inlining keeps
 * them in the server-rendered HTML with no client-side cost and no flash of
 * missing icon.
 *
 * Every icon is drawn on a 24x24 grid with a 1.8 stroke so they sit together
 * at the same optical weight. All are `aria-hidden` -- an icon here is never
 * the only label for anything, so nothing is lost by hiding them from screen
 * readers, and the alternative (a stray "star" announced next to "My points")
 * is worse.
 */
export type IconName =
  | "bell"
  | "chevron-right"
  | "star"
  | "play"
  | "users"
  | "refresh"
  | "pencil"
  | "power"
  | "check"
  | "cross"
  | "calendar"
  | "card"
  | "shield"
  | "inbox"
  | "sparkle";

export function Icon({
  name,
  className = "size-5",
}: {
  name: IconName;
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (name) {
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5" />
          <path d="M10.3 19a2 2 0 0 0 3.4 0" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="m9 5 7 7-7 7" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />
        </svg>
      );
    case "play":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m10.5 9.5 4.5 2.5-4.5 2.5z" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 20a6 6 0 0 0-2-4.5" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.6-5.9" />
          <path d="M20 4v4h-4" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" />
          <path d="m14.5 6.5 3 3" />
        </svg>
      );
    case "power":
      return (
        <svg {...common}>
          <path d="M12 3.5v8" />
          <path d="M17.7 7A8 8 0 1 1 6.3 7" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m4.5 12.5 5 5 10-11" />
        </svg>
      );
    case "cross":
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="M2.5 10h19M6 15h3" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...common}>
          <path d="M3.5 13h4l1.5 3h6l1.5-3h4" />
          <path d="M5.2 5h13.6l1.7 8v4a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-4z" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3.5c.7 4 1.8 5.1 5.8 5.8-4 .7-5.1 1.8-5.8 5.8-.7-4-1.8-5.1-5.8-5.8 4-.7 5.1-1.8 5.8-5.8Z" />
          <path d="M18 15.5c.3 1.8.8 2.3 2.6 2.6-1.8.3-2.3.8-2.6 2.6-.3-1.8-.8-2.3-2.6-2.6 1.8-.3 2.3-.8 2.6-2.6Z" />
        </svg>
      );
  }
}
