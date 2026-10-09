import { describe, it, expect } from "vitest";
import { localPartSchema, createInboxSchema } from "../src/lib/validation";
import { generateRandomLocalPart, extractVerificationCodes } from "../src/lib/utils";

describe("localPartSchema", () => {
  it("accepts valid usernames", () => {
    expect(localPartSchema.safeParse("user").success).toBe(true);
    expect(localPartSchema.safeParse("john.doe").success).toBe(true);
    expect(localPartSchema.safeParse("test_123").success).toBe(true);
    expect(localPartSchema.safeParse("a1b").success).toBe(true);
  });

  it("rejects too short", () => {
    expect(localPartSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects invalid characters", () => {
    expect(localPartSchema.safeParse("user@name").success).toBe(false);
    expect(localPartSchema.safeParse("user name").success).toBe(false);
    expect(localPartSchema.safeParse(".startswithdot").success).toBe(false);
  });

  it("rejects consecutive specials", () => {
    expect(localPartSchema.safeParse("user..name").success).toBe(false);
  });
});

describe("createInboxSchema", () => {
  it("allows empty body (random)", () => {
    expect(createInboxSchema.safeParse({}).success).toBe(true);
  });

  it("validates optional localPart", () => {
    expect(createInboxSchema.safeParse({ localPart: "validuser" }).success).toBe(true);
    expect(createInboxSchema.safeParse({ localPart: "x" }).success).toBe(false);
  });
});

describe("generateRandomLocalPart", () => {
  it("produces valid local parts", () => {
    for (let i = 0; i < 20; i++) {
      const lp = generateRandomLocalPart();
      expect(localPartSchema.safeParse(lp).success).toBe(true);
    }
  });
});

describe("extractVerificationCodes", () => {
  it("finds 6-digit codes", () => {
    const codes = extractVerificationCodes("Your code is 847291");
    expect(codes).toContain("847291");
  });

  it("returns empty for no codes", () => {
    expect(extractVerificationCodes("Hello world")).toEqual([]);
  });
});
