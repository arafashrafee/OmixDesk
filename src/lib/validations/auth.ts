import { z } from "zod";

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(120),
  email: z.email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(72),
});

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(120),
  timezone: z.string().trim().min(1, "Timezone is required").max(64),
  defaultCurrency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code (e.g. USD)"),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64),
  defaultCurrency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code (e.g. USD)"),
  email: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value.length === 0 ? null : value))
    .refine((value) => value === null || z.email().safeParse(value).success, "Enter a valid email"),
  phone: z.string().trim().max(40).transform((value) => (value.length === 0 ? null : value)),
  address: z.string().trim().max(500).transform((value) => (value.length === 0 ? null : value)),
  website: z.string().trim().max(200).transform((value) => (value.length === 0 ? null : value)),
});

export const switchOrganizationSchema = z.object({
  organizationId: z.uuid(),
});

export const createInvitationSchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "project_manager", "member"]),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(256),
});
