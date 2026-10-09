import { describe, it, expect, afterEach, vi } from "vitest";
import {
  _memoryRateLimitForTests,
  _resetMemoryRateLimitForTests,
  buildRateLimitUpsertSql,
  parseRateLimitHitCount,
  rateLimit,
} from "../src/lib/rate-limit";

describe("memory rate limit (dev helper)", () => {
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
});

describe("buildRateLimitUpsertSql", () => {
  it("uses ON CONFLICT DO UPDATE without advisory locks", () => {
    const serialized = JSON.stringify(buildRateLimitUpsertSql("test-key", 10, 60));
    expect(serialized).toContain("rate_limit_counters");
    expect(serialized).toContain("ON CONFLICT");
    expect(serialized).toContain("hit_count");
    expect(serialized).toContain("RETURNING");
    expect(serialized).not.toContain("pg_advisory");
  });
});

describe("parseRateLimitHitCount", () => {
  it("reads neon-style { rows: [...] }", () => {
    expect(parseRateLimitHitCount({ rows: [{ hit_count: 3 }] })).toBe(3);
  });

  it("reads array of rows", () => {
    expect(parseRateLimitHitCount([{ hit_count: 7 }])).toBe(7);
  });

  it("returns null for empty result (denied)", () => {
    expect(parseRateLimitHitCount([])).toBeNull();
    expect(parseRateLimitHitCount({ rows: [] })).toBeNull();
  });

  it("returns null for malformed shapes", () => {
    expect(parseRateLimitHitCount(null)).toBeNull();
    expect(parseRateLimitHitCount({ rows: [{ hit_count: "x" }] })).toBeNull();
    expect(parseRateLimitHitCount({ rows: [{}] })).toBeNull();
  });
});

describe("rateLimit production fail-closed", () => {
  const prevUrl = process.env.DATABASE_URL;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    _resetMemoryRateLimitForTests();
    if (prevUrl === undefined) Reflect.deleteProperty(process.env, "DATABASE_URL");
    else process.env.DATABASE_URL = prevUrl;
    // NODE_ENV is often read-only in the type system; use Reflect
    if (prevNode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", prevNode);
  });

  it("denies when production and DATABASE_URL is missing", async () => {
    Reflect.deleteProperty(process.env, "DATABASE_URL");
    Reflect.set(process.env, "NODE_ENV", "production");
    const r = await rateLimit("prod-no-db", 10);
    expect(r).toEqual({ success: false, remaining: 0 });
  });

  it("uses memory fallback in development without DATABASE_URL", async () => {
    Reflect.deleteProperty(process.env, "DATABASE_URL");
    Reflect.set(process.env, "NODE_ENV", "test");
    expect((await rateLimit("dev-no-db", 1)).success).toBe(true);
    expect((await rateLimit("dev-no-db", 1)).success).toBe(false);
  });

  it("denies on database execute failure in production", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    Reflect.set(process.env, "NODE_ENV", "production");
    const r = await rateLimit("db-fail", 10, {
      execute: async () => {
        throw new Error("connection refused");
      },
    });
    expect(r).toEqual({ success: false, remaining: 0 });
  });

  it("denies on malformed hit_count in production", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    Reflect.set(process.env, "NODE_ENV", "production");
    const r = await rateLimit("bad-shape", 10, {
      execute: async () => ({ rows: [{ hit_count: 999 }] }), // > limit
    });
    expect(r).toEqual({ success: false, remaining: 0 });
  });

  it("allows when execute returns valid hit_count", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    Reflect.set(process.env, "NODE_ENV", "production");
    const r = await rateLimit("ok", 10, {
      execute: async () => ({ rows: [{ hit_count: 3 }] }),
    });
    expect(r).toEqual({ success: true, remaining: 7 });
  });

  it("denies when execute returns empty rows (at limit)", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    Reflect.set(process.env, "NODE_ENV", "production");
    const r = await rateLimit("full", 10, {
      execute: async () => ({ rows: [] }),
    });
    expect(r).toEqual({ success: false, remaining: 0 });
  });

  it("falls back to memory on DB error in non-production", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    Reflect.set(process.env, "NODE_ENV", "test");
    const execute = vi.fn(async () => {
      throw new Error("boom");
    });
    const r1 = await rateLimit("dev-err", 1, { execute });
    expect(r1.success).toBe(true);
    const r2 = await rateLimit("dev-err", 1, { execute });
    expect(r2.success).toBe(false);
  });
});
