import "server-only";

/**
 * In-process fixed-window rate limiter.
 *
 * Honest about what it is: state lives in one Node process, so it resets on
 * deploy and would not be shared if the app were ever run with more than one
 * worker. For a single VPS process serving ~300 members that is genuinely
 * adequate, and it costs no infrastructure.
 *
 * It is NOT a defence against a distributed attack, and it is not what
 * protects the important things -- signature verification protects the
 * webhook, and RLS protects the data. This exists to stop one misbehaving
 * client filling the logs or the payment_events table.
 *
 * If the app ever moves to multiple instances, this needs replacing with
 * something shared rather than tuning.
 */

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

// Bound the map so a flood of distinct keys cannot grow it without limit --
// the limiter itself must not become the memory problem.
const MAX_KEYS = 5_000;

function sweep(now: number): void {
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) sweep(now);
    // Still full after sweeping means everything is live; fail OPEN rather
    // than locking out real traffic because the map is busy.
    if (buckets.size >= MAX_KEYS) {
      return { allowed: true, remaining: 0, retryAfterSeconds: 0 };
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;

  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/**
 * Best-effort client identity behind a reverse proxy.
 *
 * x-forwarded-for is trivially spoofable by the client, so this is only
 * meaningful once nginx is configured to OVERWRITE it rather than append --
 * which the deploy runbook covers. Falls back to a single shared bucket, which
 * degrades to a global limit rather than to no limit.
 */
export function clientKey(request: Request, prefix: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `${prefix}:${ip}`;
}
