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
