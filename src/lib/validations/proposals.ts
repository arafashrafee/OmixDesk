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
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a valid date");

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .refine((value) => value === null || z.uuid().safeParse(value).success, "Invalid selection");

export const proposalItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: optionalText(2000),
  quantity: z.coerce.number().positive().max(1_000_000),
  unitPrice: z.coerce.number().min(0).max(999_999_999_999.99),
});

export const proposalFormSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    leadId: optionalUuid,
    clientId: optionalUuid,
    issueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid issue date"),
    validUntil: optionalDate,
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
    introduction: optionalText(8000),
    scope: optionalText(8000),
    terms: optionalText(8000),
    clientNotes: optionalText(4000),
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
    items: z.array(proposalItemSchema).min(1).max(40),
  })
  .superRefine((value, context) => {
    const sources = Number(value.leadId !== null) + Number(value.clientId !== null);
    if (sources !== 1) {
      context.addIssue({
        code: "custom",
        message: "Choose either a lead or a client.",
        path: ["leadId"],
      });
    }
    if (
      (value.discountType === null && value.discountValue !== null) ||
      (value.discountType !== null && value.discountValue === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Set both the discount type and amount, or neither.",
        path: ["discountValue"],
      });
    }
  });

export const proposalStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["sent", "accepted", "rejected", "expired", "draft"]),
});
