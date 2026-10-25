/**
 * Validate a post-login redirect target to prevent open redirects.
 * Only same-origin relative paths are allowed.
 */
export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!candidate || typeof candidate !== "string") return fallback;
  const trimmed = candidate.trim();
  // Must be relative path starting with single /
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  if (trimmed.includes("\\")) return fallback;
  // Block protocol-relative and javascript
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return fallback;
  // Reasonable length
  if (trimmed.length > 512) return fallback;
  return trimmed;
}

export function loginUrl(next?: string | null): string {
  const dest = safeRedirectPath(next, "");
  if (!dest || dest === "/dashboard") return "/login";
  return `/login?next=${encodeURIComponent(dest)}`;
}

export function registerUrl(next?: string | null): string {
  const dest = safeRedirectPath(next, "");
  if (!dest || dest === "/dashboard") return "/register";
  return `/register?next=${encodeURIComponent(dest)}`;
}
