/**
 * Production-safe rate limiter backed by PostgreSQL (Neon).
 * Atomic under concurrency via a single SQL statement (advisory lock + count + insert).
 * Fails closed in production when the store is unavailable.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

const WINDOW_MS = 60_000;

/** In-memory fallback for local dev when DATABASE_URL is missing */
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

/** Exported for unit tests of the pure memory path */
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
 * Sliding-window rate limit.
 * Uses pg_advisory_xact_lock keyed by bucket so concurrent requests for the
 * same key serialize; count + insert happen under that lock in one statement.
 *
 * Schema (apply once via db:push or migration — see README):
 *   CREATE TABLE IF NOT EXISTS rate_limit_buckets (
 *     id BIGSERIAL PRIMARY KEY,
 *     bucket_key TEXT NOT NULL,
 *     hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *   CREATE INDEX IF NOT EXISTS rate_limit_buckets_key_hit_idx
 *     ON rate_limit_buckets (bucket_key, hit_at);
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

    // Single atomic statement:
    // 1) advisory lock for this key (hashtext)
    // 2) prune old rows for the key
    // 3) count remaining hits in window
    // 4) insert only if under limit
    // 5) return allowed + remaining
    const result = await db.execute(sql`
      WITH locked AS (
        SELECT pg_advisory_xact_lock(hashtext(${key}))
      ),
      pruned AS (
        DELETE FROM rate_limit_buckets
        WHERE bucket_key = ${key}
          AND hit_at < NOW() - make_interval(secs => ${windowSeconds})
        RETURNING 1
      ),
      counted AS (
        SELECT COUNT(*)::int AS cnt
        FROM rate_limit_buckets
        WHERE bucket_key = ${key}
          AND hit_at >= NOW() - make_interval(secs => ${windowSeconds})
      ),
      inserted AS (
        INSERT INTO rate_limit_buckets (bucket_key, hit_at)
        SELECT ${key}, NOW()
        FROM counted
        WHERE cnt < ${limit}
        RETURNING 1
      )
      SELECT
        (SELECT cnt FROM counted) AS prior_count,
        (SELECT COUNT(*)::int FROM inserted) AS did_insert
    `);

    const raw = result as unknown;
    let prior = 0;
    let didInsert = 0;
    if (raw && typeof raw === "object") {
      const r = raw as {
        rows?: Array<{ prior_count: number; did_insert: number }>;
      };
      const row = Array.isArray(r.rows)
        ? r.rows[0]
        : Array.isArray(raw)
          ? (raw as Array<{ prior_count: number; did_insert: number }>)[0]
          : undefined;
      if (row) {
        prior = Number(row.prior_count ?? 0);
        didInsert = Number(row.did_insert ?? 0);
      }
    }

    if (didInsert === 1) {
      return { success: true, remaining: Math.max(0, limit - prior - 1) };
    }
    return { success: false, remaining: 0 };
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
