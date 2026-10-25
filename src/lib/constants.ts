export const APP_NAME = "VeilMail";
export const APP_DESCRIPTION =
  "Private, persistent email built for control. Protect your inbox with VeilMail.";

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
