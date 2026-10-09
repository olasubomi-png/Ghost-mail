import { z } from "zod";

/** Username / local-part rules: 3–32 chars, alphanumeric + . _ - , must start with letter/number */
export const localPartSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(
    /^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]$/,
    "Username may only contain letters, numbers, dots, hyphens and underscores, and cannot start or end with a special character"
  )
  .refine(
    (v) => !v.includes("..") && !v.includes("--") && !v.includes("__"),
    "Username cannot contain consecutive special characters"
  );

export const createInboxSchema = z.object({
  localPart: localPartSchema.optional(),
});

export type CreateInboxInput = z.infer<typeof createInboxSchema>;

/** Minimal shape for inbound webhook payloads after provider normalization */
export const inboundMessageSchema = z.object({
  externalId: z.string().min(1).optional(),
  to: z.string().email(),
  from: z.string().min(1),
  fromName: z.string().optional(),
  subject: z.string().default("(no subject)"),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  receivedAt: z.coerce.date().optional(),
});

export type InboundMessage = z.infer<typeof inboundMessageSchema>;
