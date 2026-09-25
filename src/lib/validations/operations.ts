import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value));

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .refine(
    (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Use a valid date",
  );

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .refine((value) => value === null || z.uuid().safeParse(value).success, {
    message: "Invalid selection",
  });

export const clientFormSchema = z.object({
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
  address: optionalText(500),
  notes: optionalText(8000),
});

export const projectStatusSchema = z.enum([
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);

export const projectFormSchema = z.object({
  clientId: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(160),
  description: optionalText(8000),
  status: projectStatusSchema,
  startDate: optionalDate,
  deadline: optionalDate,
  budget: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .refine(
      (value) => value === null || /^\d+(\.\d{1,2})?$/.test(value),
      "Enter a budget with up to two decimal places",
    )
    .transform((value) => (value === null ? null : Number(value)))
    .refine((value) => value === null || (value >= 0 && value <= 999999999999.99), {
      message: "Budget is out of range",
    }),
});

export const milestoneFormSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1, "Title is required").max(160),
  description: optionalText(4000),
  status: z.enum(["pending", "completed"]),
  dueDate: optionalDate,
  sortOrder: z.coerce.number().int().min(0).max(10000),
});

export const taskFormSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1, "Title is required").max(160),
  description: optionalText(8000),
  status: z.enum(["todo", "in_progress", "done"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assignedTo: optionalUuid,
  dueDate: optionalDate,
  milestoneId: optionalUuid,
  visibleToClient: z.enum(["true", "false"]).optional(),
});

export const idSchema = z.object({
  id: z.uuid(),
});

export const projectMemberSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
});

export const fileVisibilitySchema = z.object({
  id: z.uuid(),
  visibleToClient: z.enum(["true", "false"]),
});
