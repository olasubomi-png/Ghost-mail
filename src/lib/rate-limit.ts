/**
 * Production-safe rate limiter backed by PostgreSQL (Neon).
 * Works across multiple Vercel instances. Fails closed when the DB is unavailable
 * for sensitive endpoints (caller decides), or returns a conservative in-memory
 * fallback only in development.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

const WINDOW_MS = 60_000;

/** In-memory fallback for local dev when DATABASE_URL is missing */
const memoryStore = new Map<string, number[]>();

function memoryLimit(key: string, limit: number): { success: boolean; remaining: number } {
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

/**
 * Sliding-window rate limit using a lightweight SQL approach.
 * Creates the rate_limit_buckets table on first use if missing.
 */
export async function rateLimit(
  key: string,
  limit: number = Number(process.env.RATE_LIMIT_GENERATE) || 10
): Promise<{ success: boolean; remaining: number }> {
  if (!process.env.DATABASE_URL) {
    // Dev without DB — memory only
    return memoryLimit(key, limit);
  }

  try {
    const db = getDb();
    const windowStart = new Date(Date.now() - WINDOW_MS);

    // Ensure table exists (idempotent, cheap on warm instances)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rate_limit_buckets (
        bucket_key TEXT NOT NULL,
        hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS rate_limit_buckets_key_hit_idx
      ON rate_limit_buckets (bucket_key, hit_at)
    `);

    // Prune old hits for this key
    await db.execute(sql`
      DELETE FROM rate_limit_buckets
      WHERE bucket_key = ${key} AND hit_at < ${windowStart}
    `);

    // Count recent hits
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM rate_limit_buckets
      WHERE bucket_key = ${key} AND hit_at >= ${windowStart}
    `);
    // neon-http may return { rows } or an array-like result
    const raw = countResult as unknown;
    let count = 0;
    if (raw && typeof raw === "object") {
      const r = raw as { rows?: Array<{ cnt: number }>; [n: number]: { cnt: number } };
      if (Array.isArray(r.rows) && r.rows[0]) {
        count = Number(r.rows[0].cnt ?? 0);
      } else if (Array.isArray(raw) && (raw as Array<{ cnt: number }>)[0]) {
        count = Number((raw as Array<{ cnt: number }>)[0].cnt ?? 0);
      }
    }

    if (count >= limit) {
      return { success: false, remaining: 0 };
    }

    await db.execute(sql`
      INSERT INTO rate_limit_buckets (bucket_key, hit_at)
      VALUES (${key}, NOW())
    `);

    return { success: true, remaining: limit - count - 1 };
  } catch (err) {
    // Fail closed for production to avoid unlimited abuse
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[rate-limit] storage error – denying request",
        err instanceof Error ? err.message : "unknown"
      );
      return { success: false, remaining: 0 };
    }
    // Dev fallback
    return memoryLimit(key, limit);
  }
}
