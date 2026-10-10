import sanitizeHtmlLib from "sanitize-html";

/**
 * Sanitize HTML email content to prevent XSS / script execution.
 *
 * Uses sanitize-html (pure Node, no jsdom) so the inbound webhook runs on
 * Vercel without ERR_REQUIRE_ESM from html-encoding-sniffer / @exodus/bytes.
 *
 * Returns null on empty input. On sanitizer failure, returns null so callers
 * can still persist the plain-text body.
 */
export function sanitizeHtml(dirty: string | null | undefined): string | null {
  if (!dirty) return null;

  try {
    const clean = sanitizeHtmlLib(dirty, {
      allowedTags: [
        "a",
        "b",
        "blockquote",
        "br",
        "caption",
        "code",
        "div",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "i",
        "img",
        "li",
        "ol",
        "p",
        "pre",
        "span",
        "strong",
        "table",
        "tbody",
        "td",
        "th",
        "thead",
        "tr",
        "u",
        "ul",
      ],
      allowedAttributes: {
        a: ["href", "name", "target", "rel"],
        img: ["src", "alt", "title", "width", "height"],
        td: ["colspan", "rowspan"],
        th: ["colspan", "rowspan"],
        "*": ["class"],
      },
      allowedSchemes: ["http", "https", "mailto"],
      allowProtocolRelative: false,
      // Disallow inline styles to avoid CSS-based XSS and postcss edge cases
      allowedStyles: {},
      transformTags: {
        a: sanitizeHtmlLib.simpleTransform("a", {
          rel: "noopener noreferrer",
          target: "_blank",
        }),
      },
      // Never allow these even if present in defaults
      disallowedTagsMode: "discard",
    });

    const trimmed = clean.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    console.error(
      "[sanitizeHtml] failed – HTML body discarded",
      err instanceof Error ? err.message : "unknown"
    );
    return null;
  }
}

/**
 * Basic text body cleanup – strip null bytes and normalize newlines.
 */
export function normalizeTextBody(
  text: string | null | undefined
): string | null {
  if (!text) return null;
  return text
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}
