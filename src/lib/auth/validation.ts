import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(1, "Password is required"),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(16),
});
