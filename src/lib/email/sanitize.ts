import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize HTML email content to prevent XSS / script execution.
 * Strips scripts, event handlers, dangerous tags while preserving basic formatting.
 */
export function sanitizeHtml(dirty: string | null | undefined): string | null {
  if (!dirty) return null;

  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button"],
    FORBID_ATTR: [
      "onerror",
      "onload",
      "onclick",
      "onmouseover",
      "onfocus",
      "onblur",
      "formaction",
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    // Open links in new tab safely
    ADD_TAGS: [],
  });
}

/**
 * Basic text body cleanup – strip null bytes and excessive whitespace.
 */
export function normalizeTextBody(text: string | null | undefined): string | null {
  if (!text) return null;
  return text
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}
