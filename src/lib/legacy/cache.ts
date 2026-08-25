import "server-only";

/**
 * In-process TTL cache plus a circuit breaker for the legacy catalogue.
 *
 * One VPS, one Node process per app, so a plain Map is genuinely effective
 * here rather than theatre. It resets on deploy, which is fine for a book
 * list.
 */

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 300;

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of store) if (v.expiresAt <= now) store.delete(k);
    // Still full means everything is live; drop the oldest insertion.
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export const TTL = {
  list: 60_000,
  book: 300_000,
  categories: 1_800_000,
} as const;

/**
 * Circuit breaker.
 *
 * Without it, one unreachable upstream makes EVERY catalogue page wait the
 * full query timeout before failing -- so a dead HostGator turns into a portal
 * that feels broken everywhere. After a few consecutive failures the breaker
 * opens and calls fail instantly until it is worth trying again.
 */
const FAILURE_THRESHOLD = 3;
const OPEN_MS = 30_000;

let consecutiveFailures = 0;
let openedAt = 0;

export function breakerIsOpen(): boolean {
  if (openedAt === 0) return false;
  if (Date.now() - openedAt > OPEN_MS) {
    // Half-open: let the next call through to see if it recovered.
    openedAt = 0;
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

export function recordSuccess(): void {
  consecutiveFailures = 0;
  openedAt = 0;
}

export function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURE_THRESHOLD) openedAt = Date.now();
}
