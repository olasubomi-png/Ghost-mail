import { describe, it, expect } from "vitest";
import {
  detectVerificationCodes,
  detectVerificationLinks,
  primaryVerificationCode,
  extractVerificationCodes,
  htmlToPlainText,
} from "../src/lib/email/detection";

describe("detectVerificationCodes", () => {
  it("detects labelled 6-digit OTP with high confidence", () => {
    const codes = detectVerificationCodes(
      "Verify your email",
      "Your verification code is 847291. It expires in 10 minutes."
    );
    expect(codes[0]?.code).toBe("847291");
    expect(codes[0]?.confidence).toBe("high");
    expect(primaryVerificationCode(codes)?.code).toBe("847291");
  });

  it("detects OTP keyword + 6-digit body code", () => {
    const codes = detectVerificationCodes(
      "Security code",
      "Use this one-time password to continue:\n\n392847"
    );
    expect(codes.some((c) => c.code === "392847")).toBe(true);
  });

  it("ignores bare digits without verification context", () => {
    const codes = detectVerificationCodes(
      "Your receipt",
      "Order total 49.99. Invoice 202401. Thanks!"
    );
    expect(codes).toEqual([]);
  });

  it("ignores years and date-like numbers", () => {
    const codes = detectVerificationCodes(
      "Newsletter 2026",
      "Published on 12/25/2025. Event code not applicable."
    );
    expect(codes.every((c) => c.code !== "2026")).toBe(true);
    expect(codes.every((c) => c.code !== "2025")).toBe(true);
  });

  it("detects alphanumeric codes with context", () => {
    const codes = detectVerificationCodes(
      "Confirm account",
      "Your OTP is A9B2C1"
    );
    expect(codes.some((c) => c.code === "A9B2C1")).toBe(true);
  });

  it("reads codes from HTML body", () => {
    const codes = detectVerificationCodes(
      "Verify email",
      null,
      "<p>Your verification code is <b>112233</b></p>"
    );
    expect(codes.some((c) => c.code === "112233")).toBe(true);
  });

  it("does not treat phone-like fragments as OTP without context", () => {
    const codes = detectVerificationCodes(
      "Call us",
      "Reach support at +1 (555) 123-4567 anytime."
    );
    expect(codes).toEqual([]);
  });
});

describe("detectVerificationLinks", () => {
  it("finds verify links in HTML anchors", () => {
    const links = detectVerificationLinks(
      null,
      '<a href="https://example.com/verify?token=abc">Confirm your email</a>'
    );
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].url).toContain("example.com/verify");
  });

  it("finds bare https verify URLs in text", () => {
    const links = detectVerificationLinks(
      "Please verify your account: https://app.example.com/email-confirm?t=xyz"
    );
    expect(links.some((l) => l.url.includes("email-confirm"))).toBe(true);
  });

  it("ignores unrelated links", () => {
    const links = detectVerificationLinks(
      "Read our blog https://example.com/blog/hello"
    );
    expect(links).toEqual([]);
  });

  it("rejects javascript: URLs", () => {
    const links = detectVerificationLinks(
      null,
      '<a href="javascript:alert(1)">Verify</a>'
    );
    expect(links).toEqual([]);
  });
});

describe("htmlToPlainText", () => {
  it("strips tags and scripts", () => {
    const t = htmlToPlainText(
      "<p>Hi</p><script>alert(1)</script><br/>World"
    );
    expect(t).toContain("Hi");
    expect(t).toContain("World");
    expect(t.toLowerCase()).not.toContain("script");
  });
});

describe("extractVerificationCodes back-compat", () => {
  it("returns codes for contextual OTP text", () => {
    expect(extractVerificationCodes("Your code is 847291")).toContain("847291");
  });

  it("returns empty without context", () => {
    expect(extractVerificationCodes("Hello world 1234")).toEqual([]);
  });
});
