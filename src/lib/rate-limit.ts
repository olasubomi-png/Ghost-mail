/**
 * Production-safe rate limiter for Neon (drizzle-orm/neon-http).
 *
 * ROOT CAUSE OF PRIOR APPROACH:
 * Under READ COMMITTED, a statement sees a snapshot taken at query start.
 * Waiting on pg_advisory_xact_lock does not refresh that snapshot, so a
 * concurrent transaction that inserted hits and committed while we waited
 * can still be invisible to COUNT — allowing the limit to be exceeded.
 * neon-http also does not support interactive multi-statement transactions.
 *
 * FIX:
 * One row per key in rate_limit_counters. Atomic
 *   INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING
 * serializes concurrent writers on the same primary key. PostgreSQL re-reads
 * the locked row version for the UPDATE path, so hit_count stays correct.
 * This is a fixed 60s window that resets when the window expires (standard
 * for API rate limits; not a multi-hit sliding log).
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

const WINDOW_MS = 60_000;

/** In-memory fallback ONLY when DATABASE_URL is absent (local dev). */
const memoryStore = new Map<string, number[]>();

function memoryLimit(
  key: string,
  limit: number
): { success: boolean; remaining: number } {
  const now = Date.now();
  let entry = memoryStore.get(key) ?? [];
  entry = entry.filter((t) => now - t < WINDOW_MS);
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
 * Atomic upsert SQL. Exported for structure tests.
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

function parseHitCount(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;

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

/**
 * Enforce at most `limit` requests per key per WINDOW_MS window.
 * Default limit: RATE_LIMIT_GENERATE or 10.
 */
export async function rateLimit(
  key: string,
  limit: number = Number(process.env.RATE_LIMIT_GENERATE) || 10
): Promise<{ success: boolean; remaining: number }> {
  if (!process.env.DATABASE_URL) {
    return memoryLimit(key, limit);
  }

  try {
    const db = getDb();
    const windowSeconds = Math.ceil(WINDOW_MS / 1000);

    const result = await db.execute(
      buildRateLimitUpsertSql(key, limit, windowSeconds)
    );

    const hitCount = parseHitCount(result);

    // No RETURNING row → WHERE blocked the update (already at limit)
    if (hitCount === null) {
      return { success: false, remaining: 0 };
    }

    if (hitCount < 1 || hitCount > limit) {
      // Unexpected shape — fail closed in production
      if (process.env.NODE_ENV === "production") {
        console.error("[rate-limit] unexpected hit_count – denying request");
        return { success: false, remaining: 0 };
      }
      return memoryLimit(key, limit);
    }

    return {
      success: true,
      remaining: Math.max(0, limit - hitCount),
    };
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[rate-limit] storage error – denying request",
        err instanceof Error ? err.message : "unknown"
      );
      return { success: false, remaining: 0 };
    }
    return memoryLimit(key, limit);
  }
}
