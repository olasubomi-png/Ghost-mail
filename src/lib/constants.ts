export const APP_NAME = "Ghost Mail";
export const APP_DESCRIPTION =
  "Premium persistent temporary email. Protect your real inbox from spam, trackers, and data breaches.";

/** Domain used for generated addresses. Must match the inbound provider domain. */
export function getEmailDomain(): string {
  const domain = process.env.EMAIL_DOMAIN;
  if (!domain || domain === "yourdomain.com") {
    return "";
  }
  return domain.toLowerCase().trim();
}

export function isDomainConfigured(): boolean {
  return Boolean(getEmailDomain());
}
