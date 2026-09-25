import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/billing/rules";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value));

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .refine((value) => value === null || z.uuid().safeParse(value).success, "Invalid selection");

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(1_000_000),
  unitPrice: z.coerce.number().min(0).max(999_999_999_999.99),
});

export const invoiceFormSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    clientId: z.string().trim().pipe(z.uuid()),
    projectId: optionalUuid,
    proposalId: optionalUuid,
    issueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid issue date"),
    dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid due date"),
    currency: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => /^[A-Z]{3}$/.test(value), "Use a 3-letter currency code"),
    recipientName: z.string().trim().min(1).max(160),
    recipientCompany: optionalText(160),
    recipientEmail: z
      .string()
      .trim()
      .max(200)
      .transform((value) => (value.length === 0 ? null : value))
      .refine((value) => value === null || z.email().safeParse(value).success, "Enter a valid email"),
    recipientPhone: optionalText(40),
    recipientAddress: optionalText(500),
    notes: optionalText(4000),
    terms: optionalText(8000),
    internalNotes: optionalText(4000),
    discountType: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .refine(
        (value) => value === null || value === "fixed" || value === "percentage",
        "Invalid discount",
      ),
    discountValue: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .refine((value) => value === null || /^\d+(\.\d{1,2})?$/.test(value), "Invalid discount")
      .transform((value) => (value === null ? null : Number(value))),
    taxPercent: z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .refine((value) => value === null || /^\d+(\.\d{1,4})?$/.test(value), "Invalid tax")
      .transform((value) => (value === null ? null : Number(value))),
    items: z.array(invoiceItemSchema).min(1).max(40),
  })
  .superRefine((value, context) => {
    if (value.dueDate < value.issueDate) {
      context.addIssue({ code: "custom", message: "Due date cannot be before the issue date.", path: ["dueDate"] });
    }
  });

export const paymentFormSchema = z.object({
  id: z.uuid(),
  amount: z.coerce.number().positive(),
  paymentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid payment date"),
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(120),
  notes: optionalText(1000),
});
