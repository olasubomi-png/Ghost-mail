/**
 * Server-side owner account check.
 * OWNER_EMAIL must be set in the environment; never trust client-supplied emails.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) return false;
  if (!email || typeof email !== "string") return false;
  return email.trim().toLowerCase() === ownerEmail;
}
