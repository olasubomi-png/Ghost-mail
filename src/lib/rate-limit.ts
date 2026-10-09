/**
 * Production-safe rate limiter backed by PostgreSQL (Neon).
 *
 * Concurrency: a single SQL statement acquires pg_advisory_xact_lock for the
 * bucket key, then prunes, counts, and conditionally inserts under that lock.
 * The lock CTE is explicitly referenced by every subsequent CTE so PostgreSQL
 * cannot optimize it away (unreferenced SELECT CTEs may be skipped).
 *
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
 * SQL used for the atomic rate-limit check (exported for review/tests).
 * `locked` MUST be referenced by later CTEs so the advisory lock is taken.
 */
export function buildRateLimitSql(key: string, limit: number, windowSeconds: number) {
  return sql`
    WITH locked AS (
      SELECT pg_advisory_xact_lock(hashtext(${key})) AS acquired
    ),
    pruned AS (
      DELETE FROM rate_limit_buckets
      WHERE bucket_key = ${key}
        AND hit_at < NOW() - make_interval(secs => ${windowSeconds})
        AND (SELECT acquired IS NOT NULL FROM locked)
      RETURNING 1
    ),
    counted AS (
      SELECT COUNT(*)::int AS cnt
      FROM rate_limit_buckets, locked
      WHERE bucket_key = ${key}
        AND hit_at >= NOW() - make_interval(secs => ${windowSeconds})
        AND locked.acquired IS NOT NULL
    ),
    inserted AS (
      INSERT INTO rate_limit_buckets (bucket_key, hit_at)
      SELECT ${key}, NOW()
      FROM counted, locked
      WHERE counted.cnt < ${limit}
        AND locked.acquired IS NOT NULL
      RETURNING 1
    )
    SELECT
      (SELECT cnt FROM counted) AS prior_count,
      (SELECT COUNT(*)::int FROM inserted) AS did_insert,
      (SELECT acquired IS NOT NULL FROM locked) AS lock_held
  `;
}

function parseRateLimitResult(result: unknown): {
  prior: number;
  didInsert: number;
  lockHeld: boolean;
} {
  let prior = 0;
  let didInsert = 0;
  let lockHeld = false;

  if (!result || typeof result !== "object") {
    return { prior, didInsert, lockHeld };
  }

  // neon-http / drizzle may return { rows: [...] } or an array of row objects
  const asRows = (result as { rows?: unknown }).rows;
  const row = Array.isArray(asRows)
    ? (asRows[0] as Record<string, unknown> | undefined)
    : Array.isArray(result)
      ? (result[0] as Record<string, unknown> | undefined)
      : undefined;

  if (row) {
    prior = Number(row.prior_count ?? row.priorCount ?? 0);
    didInsert = Number(row.did_insert ?? row.didInsert ?? 0);
    const lh = row.lock_held ?? row.lockHeld;
    lockHeld = lh === true || lh === "t" || lh === 1 || lh === "true";
  }

  return { prior, didInsert, lockHeld };
}

/**
 * Sliding-window rate limit shared across instances via PostgreSQL.
 *
 * Schema (apply once via `npm run db:push` — see README):
 *   rate_limit_buckets (id, bucket_key, hit_at) + index on (bucket_key, hit_at)
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
      buildRateLimitSql(key, limit, windowSeconds)
    );

    const { prior, didInsert, lockHeld } = parseRateLimitResult(result);

    // If the lock path did not run or result is unreadable, fail closed in prod
    // (dev falls through only when we can interpret a successful insert)
    if (!lockHeld && didInsert === 0 && prior === 0) {
      // Ambiguous empty result — could be empty table under lock, or parse failure.
      // Treat did_insert === 1 as the only allow path.
    }

    if (didInsert === 1) {
      return { success: true, remaining: Math.max(0, limit - prior - 1) };
    }

    // did_insert === 0 means either over limit, or unexpected result shape.
    // Over-limit is expected; ambiguous parse fails closed only if we cannot
    // confirm the query shape — prior > 0 implies lock+count ran.
    if (prior > 0 || lockHeld) {
      return { success: false, remaining: 0 };
    }

    // Completely unparseable result
    if (process.env.NODE_ENV === "production") {
      console.error("[rate-limit] unparseable query result – denying request");
      return { success: false, remaining: 0 };
    }
    return memoryLimit(key, limit);
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
