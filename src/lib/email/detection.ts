/**
 * Heuristic detection of verification codes (OTP) and confirmation links
 * in email subject/body. Pure functions – safe for client and server.
 *
 * Designed to prefer contextual matches and reduce false positives from
 * dates, phone numbers, and order IDs.
 */

export type DetectedCode = {
  code: string;
  /** Higher is more confident. Only high-confidence codes should be shown as primary. */
  confidence: "high" | "medium" | "low";
  source: "subject" | "body";
};

export type DetectedLink = {
  url: string;
  label: string;
  confidence: "high" | "medium" | "low";
};

const OTP_CONTEXT =
  /\b(verification\s*code|verify(?:\s+your)?(?:\s+email|\s+account|\s+code)?|one[\s-]?time(?:\s+pass(?:word|code)?|\s+code)?|\botp\b|security\s*code|auth(?:entication)?\s*code|login\s*code|confirm(?:ation)?\s*code|passcode|pin\s*code|access\s*code|2fa|two[\s-]?factor)\b/i;

const LINK_CONTEXT =
  /\b(verify|confirm|activate|validation|click\s+here|complete\s+(?:your\s+)?(?:sign[\s-]?up|registration)|confirm\s+your\s+email)\b/i;

const VERIFY_HREF =
  /(?:verify|confirm|activate|validation|email-confirm|confirm-email|account-confirm|signup|sign-up|register)/i;

/** Strip tags to plain text for analysis (does not execute HTML). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function windowAround(text: string, index: number, radius = 48): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end);
}

function looksLikeDateOrPhone(token: string, context: string): boolean {
  // Phone-like: +1 555..., or long digit runs with separators nearby
  if (/\+?\d[\d\s().-]{8,}\d/.test(context) && token.length <= 4) return true;
  // Dates: 2024, 12/25, 2026-01-01 fragments
  if (/^(19|20)\d{2}$/.test(token)) return true;
  if (/\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b/.test(context) && token.length <= 4)
    return true;
  // Order / invoice ids often prefixed
  if (/\b(order|invoice|ref|reference|ticket|tracking|id)[:\s#-]*$/i.test(
    context.slice(0, context.indexOf(token) + 1)
  ))
    return true;
  return false;
}

/**
 * Detect likely OTP / verification codes from subject + body text.
 * Returns at most a few high/medium confidence codes, sorted by confidence.
 */
export function detectVerificationCodes(
  subject: string | null | undefined,
  textBody: string | null | undefined,
  htmlBody?: string | null
): DetectedCode[] {
  const subjectText = subject || "";
  const bodyText = [textBody || "", htmlBody ? htmlToPlainText(htmlBody) : ""]
    .filter(Boolean)
    .join("\n");

  const results: DetectedCode[] = [];
  const seen = new Set<string>();

  function scan(source: "subject" | "body", text: string) {
    if (!text) return;
    const globalContext = OTP_CONTEXT.test(text);

    // Explicit labelled codes: "code: 123456", "OTP is AB12CD"
    const labelled =
      /(?:code|otp|passcode|pin)\s*(?:is|:|=)\s*([A-Z0-9]{4,8})\b/gi;
    let m: RegExpExecArray | null;
    while ((m = labelled.exec(text)) !== null) {
      const code = m[1];
      if (seen.has(code)) continue;
      if (/^(19|20)\d{2}$/.test(code)) continue;
      seen.add(code);
      results.push({ code, confidence: "high", source });
    }

    // Standalone 4–8 digit sequences
    const numeric = /\b(\d{4,8})\b/g;
    while ((m = numeric.exec(text)) !== null) {
      const code = m[1];
      if (seen.has(code)) continue;
      const ctx = windowAround(text, m.index);
      if (looksLikeDateOrPhone(code, ctx)) continue;

      const localContext = OTP_CONTEXT.test(ctx);
      if (localContext) {
        seen.add(code);
        results.push({
          code,
          confidence: code.length === 6 ? "high" : "medium",
          source,
        });
      } else if (globalContext && code.length === 6) {
        // Global verification wording + classic 6-digit code
        seen.add(code);
        results.push({ code, confidence: "medium", source });
      }
      // No context + random digits → ignore (avoid order numbers, years)
    }

    // Alphanumeric only with local context
    const alpha = /\b([A-Z0-9]{6,8})\b/g;
    while ((m = alpha.exec(text)) !== null) {
      const code = m[1];
      if (seen.has(code)) continue;
      if (/^\d+$/.test(code)) continue; // already handled
      if (!/[A-Z]/i.test(code) || !/\d/.test(code)) continue; // must be mixed
      const ctx = windowAround(text, m.index);
      if (!OTP_CONTEXT.test(ctx) && !globalContext) continue;
      seen.add(code);
      results.push({
        code,
        confidence: OTP_CONTEXT.test(ctx) ? "high" : "medium",
        source,
      });
    }
  }

  scan("subject", subjectText);
  scan("body", bodyText);

  const rank = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => rank[a.confidence] - rank[b.confidence]);

  // Only surface high/medium; avoid uncertain low confidence as primary
  return results.filter((r) => r.confidence !== "low").slice(0, 3);
}

/** Primary code for prominent display, or null if uncertain. */
export function primaryVerificationCode(
  codes: DetectedCode[]
): DetectedCode | null {
  if (codes.length === 0) return null;
  if (codes[0].confidence === "high") return codes[0];
  // Single medium-confidence is acceptable; multiple medium → uncertain
  if (codes.length === 1 && codes[0].confidence === "medium") return codes[0];
  return null;
}

/**
 * Detect likely account-verification / email-confirmation links.
 * Does not follow links. Only http(s) URLs.
 */
export function detectVerificationLinks(
  textBody: string | null | undefined,
  htmlBody?: string | null
): DetectedLink[] {
  const links: DetectedLink[] = [];
  const seen = new Set<string>();

  function add(url: string, label: string, confidence: DetectedLink["confidence"]) {
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      // Block obvious javascript/data (already filtered by protocol)
      if (seen.has(u.href)) return;
      seen.add(u.href);
      links.push({ url: u.href, label, confidence });
    } catch {
      // invalid URL
    }
  }

  // From HTML anchors
  if (htmlBody) {
    const anchorRe =
      /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(htmlBody)) !== null) {
      const href = m[1].trim();
      const inner = htmlToPlainText(m[2] || "").slice(0, 80);
      const nearby = (inner + " " + href).toLowerCase();
      if (VERIFY_HREF.test(href) || LINK_CONTEXT.test(inner)) {
        add(
          href,
          inner && inner.length > 2 ? inner : "Verify account",
          VERIFY_HREF.test(href) ? "high" : "medium"
        );
      } else if (LINK_CONTEXT.test(nearby)) {
        add(href, inner || "Confirm email", "medium");
      }
    }
  }

  // Bare URLs in plain text
  const plain = [textBody || "", htmlBody ? htmlToPlainText(htmlBody) : ""]
    .filter(Boolean)
    .join("\n");
  const urlRe = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
  let um: RegExpExecArray | null;
  while ((um = urlRe.exec(plain)) !== null) {
    const url = um[0].replace(/[.,;:]+$/, "");
    const ctx = windowAround(plain, um.index, 60);
    if (VERIFY_HREF.test(url) || LINK_CONTEXT.test(ctx)) {
      add(
        url,
        "Verify account",
        VERIFY_HREF.test(url) ? "high" : "medium"
      );
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  links.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
  return links.filter((l) => l.confidence !== "low").slice(0, 3);
}

/** Back-compat helper used by older call sites. */
export function extractVerificationCodes(text: string): string[] {
  const codes = detectVerificationCodes("", text, null);
  return codes.map((c) => c.code);
}
