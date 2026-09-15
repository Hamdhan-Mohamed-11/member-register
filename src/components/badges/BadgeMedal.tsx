import { BadgeIcon } from "./BadgeIcon";

/**
 * Colour per badge family, so a row of medals reads as sets at a glance:
 * blue for reading, violet for presenting, amber for turning up, gold for
 * points, green for giving, navy for the one-offs. Grey is reserved for a
 * badge not yet earned.
 */
const TONES = {
  sky: { from: "#38c6f4", to: "#0284c7", rim: "#0369a1" },
  violet: { from: "#a78bfa", to: "#7c3aed", rim: "#6d28d9" },
  amber: { from: "#fcd34d", to: "#f59e0b", rim: "#d97706" },
  gold: { from: "#fde68a", to: "#eab308", rim: "#ca8a04" },
  green: { from: "#6ee7b7", to: "#10b981", rim: "#047857" },
  navy: { from: "#6674d6", to: "#293896", rim: "#1f2a75" },
  locked: { from: "#d1d5db", to: "#9ca3af", rim: "#6b7280" },
} as const;

export type MedalTone = keyof typeof TONES;

const FAMILY_TONE: Record<string, MedalTone> = {
  books_read: "sky",
  presented: "violet",
  attend_streak: "amber",
  points: "gold",
  readrise: "green",
};

export function medalTone(family: string | null | undefined): MedalTone {
  return (family && FAMILY_TONE[family]) || "navy";
}

const SIZES = {
  sm: { box: "size-12", glyph: "size-5" },
  md: { box: "size-16", glyph: "size-7" },
  lg: { box: "size-20", glyph: "size-9" },
} as const;

/**
 * A badge as a hexagonal medal: a gradient face, a darker rim, a soft
 * highlight across the top, and the badge's glyph in white.
 *
 * Drawn in SVG rather than CSS clip-path so the corners can be rounded (a
 * thick round-joined stroke on the same polygon) and the rim survives -- a
 * clip-path hexagon clips its own border off.
 *
 * Gradient ids are keyed by tone, not per instance. Every medal of one tone
 * defines an identical gradient, so a duplicate id resolves to the same
 * paint whichever copy the browser picks, and this stays a server component.
 */
export function BadgeMedal({
  icon,
  tone,
  size = "md",
  className = "",
}: {
  icon: string;
  tone: MedalTone;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const t = TONES[tone];
  const gid = `pab-medal-${tone}`;
  const hex = "50,6 88,28 88,72 50,94 12,72 12,28";

  return (
    <span className={`relative inline-grid shrink-0 place-items-center ${SIZES[size].box} ${className}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-sm" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={t.from} />
            <stop offset="1" stopColor={t.to} />
          </linearGradient>
        </defs>
        {/* Rim: the same hexagon, stroked wide with round joins. */}
        <polygon points={hex} fill={t.rim} stroke={t.rim} strokeWidth="10" strokeLinejoin="round" />
        {/* Face. */}
        <polygon
          points="50,13 82,31.5 82,68.5 50,87 18,68.5 18,31.5"
          fill={`url(#${gid})`}
          stroke={`url(#${gid})`}
          strokeWidth="6"
          strokeLinejoin="round"
        />
        {/* Highlight over the upper half. */}
        <polygon
          points="50,13 82,31.5 82,46 50,38 18,46 18,31.5"
          fill="#ffffff"
          opacity="0.18"
          stroke="#ffffff"
          strokeOpacity="0.18"
          strokeWidth="6"
          strokeLinejoin="round"
        />
      </svg>
      <BadgeIcon name={icon} className={`relative text-white ${SIZES[size].glyph}`} />
    </span>
  );
}
