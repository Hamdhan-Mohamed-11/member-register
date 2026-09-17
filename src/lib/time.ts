/**
 * Short relative times for lists ("2h ago", "3 Sept").
 *
 * Rendered on the SERVER only, so there is no hydration mismatch to worry
 * about -- but that also means it reflects the server's clock, which is why it
 * falls back to an absolute date beyond a week rather than drifting into
 * "34 days ago" for something that may have been rendered hours earlier.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);

  // A clock skew between the database and the app should not produce
  // "in 3 seconds" on a row that was just written.
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return then.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * The club's timezone. Every session time is typed, stored and shown as Sri
 * Lanka time, named explicitly rather than taken from the server's clock --
 * the VPS runs in UTC, and relying on the process timezone stored a time typed
 * as 6.30pm as 6.30pm UTC, five and a half hours late.
 */
export const CLUB_TZ = "Asia/Colombo";

/** Sri Lanka is UTC+5:30 all year -- no daylight saving to account for. */
const CLUB_OFFSET = "+05:30";

/** A datetime-local value ("2026-09-17T18:30"), read as Sri Lanka time. */
export function clubLocalToIso(local: string): string {
  const withSeconds = /T\d{2}:\d{2}$/.test(local) ? `${local}:00` : local;
  return new Date(`${withSeconds}${CLUB_OFFSET}`).toISOString();
}

/** An instant, as a datetime-local value in Sri Lanka time. */
export function isoToClubLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
