import { z } from "zod";
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  OPEN_LEAD_STATUSES,
  SERVICE_INTERESTS,
  USER_ACTIVITY_TYPES,
} from "@/lib/crm/constants";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value));

const optionalChoice = (choices: readonly string[]) =>
  z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .refine((value) => value === null || choices.includes(value), {
      message: "Choose a listed value",
    });

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .refine((value) => value === null || z.uuid().safeParse(value).success, {
    message: "Invalid selection",
  });

const optionalFollowUp = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .refine(
    (value) => value === null || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value),
    "Use a valid follow-up time",
  );

export const leadFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  company: optionalText(160),
  email: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value.length === 0 ? null : value))
    .refine((value) => value === null || z.email().safeParse(value).success, {
      message: "Enter a valid email",
    }),
  phone: optionalText(40),
  source: optionalChoice(LEAD_SOURCES),
  serviceInterest: optionalChoice(SERVICE_INTERESTS),
  estimatedValue: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .refine(
      (value) => value === null || /^\d+(\.\d{1,2})?$/.test(value),
      "Enter a value with up to two decimal places",
    )
    .transform((value) => (value === null ? null : Number(value)))
    .refine((value) => value === null || (value >= 0 && value <= 999999999999.99), {
      message: "Estimated value is out of range",
    }),
  status: z.enum(OPEN_LEAD_STATUSES),
  priority: z.enum(LEAD_PRIORITIES),
  assignedTo: optionalUuid,
  nextFollowUp: optionalFollowUp,
  notes: optionalText(8000),
});

export const leadStatusChangeSchema = z.object({
  id: z.uuid(),
  status: z.enum(OPEN_LEAD_STATUSES),
});

export const markLeadLostSchema = z.object({
  id: z.uuid(),
  lostReason: z.string().trim().min(1, "Add a lost reason").max(500),
});

export const reopenLeadSchema = z.object({
  id: z.uuid(),
  status: z.enum(OPEN_LEAD_STATUSES),
});

export const leadActivitySchema = z.object({
  leadId: z.uuid(),
  activityType: z.enum(USER_ACTIVITY_TYPES),
  content: z.string().trim().min(1, "Add a note").max(4000),
});

export const convertLeadSchema = z.object({
  id: z.uuid(),
});
