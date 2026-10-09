import { describe, it, expect, afterEach } from "vitest";
import {
  _memoryRateLimitForTests,
  _resetMemoryRateLimitForTests,
  buildRateLimitUpsertSql,
  rateLimit,
} from "../src/lib/rate-limit";

describe("memory rate limit (dev fallback)", () => {
  afterEach(() => _resetMemoryRateLimitForTests());

  it("allows exactly limit requests then blocks", () => {
    const key = "boundary-key";
    const limit = 5;
    const results = Array.from({ length: limit + 2 }, () =>
      _memoryRateLimitForTests(key, limit)
    );
    expect(results.slice(0, limit).every((r) => r.success)).toBe(true);
    expect(results.slice(limit).every((r) => !r.success)).toBe(true);
  });

  it("isolates different keys", () => {
    expect(_memoryRateLimitForTests("a", 1).success).toBe(true);
    expect(_memoryRateLimitForTests("a", 1).success).toBe(false);
    expect(_memoryRateLimitForTests("b", 1).success).toBe(true);
  });

  it("remaining counts down", () => {
    const key = "rem";
    expect(_memoryRateLimitForTests(key, 3).remaining).toBe(2);
    expect(_memoryRateLimitForTests(key, 3).remaining).toBe(1);
    expect(_memoryRateLimitForTests(key, 3).remaining).toBe(0);
    expect(_memoryRateLimitForTests(key, 3).success).toBe(false);
  });
});

describe("buildRateLimitUpsertSql structure", () => {
  it("uses ON CONFLICT DO UPDATE with hit_count and window reset", () => {
    const serialized = JSON.stringify(buildRateLimitUpsertSql("test-key", 10, 60));
    expect(serialized).toContain("rate_limit_counters");
    expect(serialized).toContain("ON CONFLICT");
    expect(serialized).toContain("hit_count");
    expect(serialized).toContain("window_start");
    expect(serialized).toContain("RETURNING");
    // Must not rely on advisory locks (broken under single-statement snapshots)
    expect(serialized).not.toContain("pg_advisory");
  });
});

describe("rateLimit without DATABASE_URL uses memory", () => {
  afterEach(() => _resetMemoryRateLimitForTests());

  it("falls back when DATABASE_URL is unset", async () => {
    const prev = process.env.DATABASE_URL;
    Reflect.deleteProperty(process.env, "DATABASE_URL");
    try {
      const r = await rateLimit("no-db-key", 2);
      expect(r.success).toBe(true);
      const r2 = await rateLimit("no-db-key", 2);
      expect(r2.success).toBe(true);
      const r3 = await rateLimit("no-db-key", 2);
      expect(r3.success).toBe(false);
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev;
    }
  });
});
