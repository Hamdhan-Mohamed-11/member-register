/**
 * The badge glyphs.
 *
 * Separate from `ui/Icon` on purpose. These are drawn to sit inside a filled
 * disc at 40-56px rather than beside a line of text at 20px, so they use a
 * heavier stroke and simpler shapes — the same drawings scaled down turn to
 * mush, and Icon's drawings scaled up look spindly.
 *
 * `badges.icon` in the database is a KEY, never markup or a URL, and this is
 * the only place a key becomes a drawing. That is what stops a badge row from
 * ever putting anything of its own on a page. An unknown key falls back to the
 * medal rather than rendering nothing, so a badge added in SQL before its
 * glyph exists still looks like a badge.
 */
export type BadgeIconName =
  | "book"
  | "mic"
  | "flame"
  | "star"
  | "video"
  | "ticket"
  | "users"
  | "id"
  | "flag"
  | "heart"
  | "medal";

export function BadgeIcon({
  name,
  className = "size-6",
}: {
  name: string;
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (name) {
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5z" />
          <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z" />
        </svg>
      );
    case "mic":
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="10" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
          <path d="M12 17.5V21M9 21h6" />
        </svg>
      );
    case "flame":
      return (
        <svg {...common}>
          <path d="M12 3s5 3.8 5 8.5a5 5 0 0 1-10 0C7 9 9 7.5 9 7.5s0 2 1.5 2.5C11 8 12 6 12 3" />
          <path d="M12 21a5 5 0 0 0 5-5" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9 6.7 19.7l1.1-5.9L3.5 9.7l5.9-.8z" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="12" height="12" rx="2.5" />
          <path d="m15 10.5 5-2.8v8.6l-5-2.8z" />
        </svg>
      );
    case "ticket":
      return (
        <svg {...common}>
          <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v1.8a2 2 0 0 0 0 3.4v1.8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5v-1.8a2 2 0 0 0 0-3.4z" />
          <path d="M13.5 7v10" strokeDasharray="1.5 2.2" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9.5" cy="8.5" r="3.2" />
          <path d="M3.5 19.5a6 6 0 0 1 12 0" />
          <path d="M16 6.2a3.2 3.2 0 0 1 0 6.1M17.5 14.4a6 6 0 0 1 3 5.1" />
        </svg>
      );
    case "id":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <circle cx="9" cy="11" r="2.2" />
          <path d="M5.8 16.2a3.6 3.6 0 0 1 6.4 0M14.5 10h4M14.5 13.5h2.5" />
        </svg>
      );
    case "flag":
      return (
        <svg {...common}>
          <path d="M6 21V4" />
          <path d="M6 4.5h9.5l-1.6 3.2 1.6 3.3H6z" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8.4a3.8 3.8 0 0 1 7 2.4c0 4.8-7 9.2-7 9.2z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="14.5" r="5.5" />
          <path d="m8 9-2.5-5h13L16 9" />
          <path d="m12 12 .9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9.1 14.2l2-.3z" />
        </svg>
      );
  }
}
