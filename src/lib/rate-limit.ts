/**
 * Production-safe rate limiter for Neon (drizzle-orm/neon-http).
 *
 * Uses rate_limit_counters with INSERT … ON CONFLICT DO UPDATE so concurrent
 * writers serialize on the primary key under READ COMMITTED (compatible with
 * neon-http; no interactive transactions required).
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

const WINDOW_MS = 60_000;

/** In-memory fallback ONLY for non-production when DATABASE_URL is absent. */
const memoryStore = new Map<string, number[]>();

function memoryLimit(
  key: string,
  limit: number,
  windowMs: number = WINDOW_MS
): { success: boolean; remaining: number } {
  const now = Date.now();
  let entry = memoryStore.get(key) ?? [];
  entry = entry.filter((t) => now - t < windowMs);
  if (entry.length >= limit) {
    memoryStore.set(key, entry);
    return { success: false, remaining: 0 };
  }
  entry.push(now);
  memoryStore.set(key, entry);
  return { success: true, remaining: limit - entry.length };
}

export function _memoryRateLimitForTests(
  key: string,
  limit: number
): { success: boolean; remaining: number } {
  return memoryLimit(key, limit);
}

export function _resetMemoryRateLimitForTests() {
  memoryStore.clear();
}

/**
 * Atomic upsert SQL. Exported for structure tests and shared with integration.
 * Returns one row with hit_count when allowed; zero rows when denied.
 */
export function buildRateLimitUpsertSql(
  key: string,
  limit: number,
  windowSeconds: number
) {
  return sql`
    INSERT INTO rate_limit_counters (bucket_key, window_start, hit_count)
    VALUES (${key}, NOW(), 1)
    ON CONFLICT (bucket_key) DO UPDATE SET
      hit_count = CASE
        WHEN rate_limit_counters.window_start
          <= NOW() - make_interval(secs => ${windowSeconds})
        THEN 1
        ELSE rate_limit_counters.hit_count + 1
      END,
      window_start = CASE
        WHEN rate_limit_counters.window_start
          <= NOW() - make_interval(secs => ${windowSeconds})
        THEN NOW()
        ELSE rate_limit_counters.window_start
      END
    WHERE
      rate_limit_counters.window_start
        <= NOW() - make_interval(secs => ${windowSeconds})
      OR rate_limit_counters.hit_count < ${limit}
    RETURNING hit_count
  `;
}

/** Parse Neon/drizzle execute result → hit_count or null if denied / unreadable. */
export function parseRateLimitHitCount(result: unknown): number | null {
  if (result == null) return null;

  // Empty array = no RETURNING row (denied)
  if (Array.isArray(result) && result.length === 0) return null;

  if (typeof result !== "object") return null;

  const asRows = (result as { rows?: unknown }).rows;
  const row = Array.isArray(asRows)
    ? (asRows[0] as Record<string, unknown> | undefined)
    : Array.isArray(result)
      ? (result[0] as Record<string, unknown> | undefined)
      : undefined;

  if (!row) return null;

  const raw = row.hit_count ?? row.hitCount;
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export type RateLimitExecute = (
  query: ReturnType<typeof buildRateLimitUpsertSql>
) => Promise<unknown>;

export type RateLimitOptions = {
  /** Override window length (ms). Production uses 60_000. */
  windowMs?: number;
  /** Inject execute for tests; production uses getDb().execute. */
  execute?: RateLimitExecute;
};

/**
 * Enforce at most `limit` requests per key per window.
 * Default limit: RATE_LIMIT_GENERATE or 10.
 */
export async function rateLimit(
  key: string,
  limit: number = Number(process.env.RATE_LIMIT_GENERATE) || 10,
  options: RateLimitOptions = {}
): Promise<{ success: boolean; remaining: number }> {
  const isProduction = process.env.NODE_ENV === "production";
  const windowMs = options.windowMs ?? WINDOW_MS;
  const windowSeconds = Math.ceil(windowMs / 1000);

  if (!process.env.DATABASE_URL) {
    // Never use in-memory limiting in production
    if (isProduction) {
      console.error("[rate-limit] DATABASE_URL missing in production – denying");
      return { success: false, remaining: 0 };
    }
    return memoryLimit(key, limit, windowMs);
  }

  try {
    const execute: RateLimitExecute =
      options.execute ??
      (async (query) => {
        const db = getDb();
        return db.execute(query);
      });

    const result = await execute(
      buildRateLimitUpsertSql(key, limit, windowSeconds)
    );

    const hitCount = parseRateLimitHitCount(result);

    // No RETURNING row → at limit (or empty result)
    if (hitCount === null) {
      return { success: false, remaining: 0 };
    }

    if (hitCount < 1 || hitCount > limit) {
      // Malformed / unexpected — always fail closed (no memory fallback in prod path)
      if (isProduction) {
        console.error("[rate-limit] unexpected hit_count – denying request");
      }
      return { success: false, remaining: 0 };
    }

    return {
      success: true,
      remaining: Math.max(0, limit - hitCount),
    };
  } catch (err) {
    if (isProduction) {
      console.error(
        "[rate-limit] storage error – denying request",
        err instanceof Error ? err.message : "unknown"
      );
      return { success: false, remaining: 0 };
    }
    // Dev only: soft-fallback when DB is misconfigured
    return memoryLimit(key, limit, windowMs);
  }
}
