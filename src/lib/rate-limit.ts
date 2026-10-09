/**
 * Simple in-memory sliding-window rate limiter.
 * Suitable for single-instance / development.
 * For production multi-instance, replace with Redis / Upstash.
 */

type Entry = { timestamps: number[] };

const store = new Map<string, Entry>();

const WINDOW_MS = 60_000; // 1 minute

export function rateLimit(
  key: string,
  limit: number = Number(process.env.RATE_LIMIT_GENERATE) || 10
): { success: boolean; remaining: number } {
  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Drop timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= limit) {
    return { success: false, remaining: 0 };
  }

  entry.timestamps.push(now);
  return { success: true, remaining: limit - entry.timestamps.length };
}

/** Cleanup old keys periodically (call from a cron or on demand) */
export function pruneRateLimitStore() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}
