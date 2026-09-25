"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateInvoiceMoney } from "@/lib/billing/rules";
import { invoiceCanBeDeleted, previewPayment } from "@/lib/billing/rules";
import { actionFail, actionOk, type ActionResult } from "@/lib/errors";
import { ACCESS_DENIED, firstAffected } from "@/lib/operations/mutation";
import { getStaffContext } from "@/lib/operations/access";
import { canWriteInvoices } from "@/lib/rbac";
import { dispatchEntityEmail } from "@/lib/email/dispatch";
import { idSchema } from "@/lib/validations/operations";
import { invoiceFormSchema, paymentFormSchema } from "@/lib/validations/invoices";

function refreshInvoice(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/invoices");
  revalidatePath("/portal");
  revalidatePath("/portal/invoices");
  if (id) {
    revalidatePath(`/dashboard/invoices/${id}`);
    revalidatePath(`/dashboard/invoices/${id}/edit`);
    revalidatePath(`/dashboard/invoices/${id}/print`);
    revalidatePath(`/portal/invoices/${id}`);
  }
}

function readForm(formData: FormData) {
  let items: unknown = [];
  try {
    const raw = formData.get("items");
    items = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    items = [];
  }

  return invoiceFormSchema.safeParse({
    title: formData.get("title"),
    clientId: formData.get("clientId"),
    projectId: formData.get("projectId"),
    proposalId: formData.get("proposalId"),
    issueDate: formData.get("issueDate"),
    dueDate: formData.get("dueDate"),
    currency: formData.get("currency"),
    recipientName: formData.get("recipientName"),
    recipientCompany: formData.get("recipientCompany"),
    recipientEmail: formData.get("recipientEmail"),
    recipientPhone: formData.get("recipientPhone"),
    recipientAddress: formData.get("recipientAddress"),
    notes: formData.get("notes"),
    terms: formData.get("terms"),
    internalNotes: formData.get("internalNotes"),
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    taxPercent: formData.get("taxPercent"),
    items,
  });
}

async function saveDraft(
  organizationId: string,
  invoiceId: string | null,
  input: {
    title: string;
    clientId: string;
    projectId: string | null;
    proposalId: string | null;
    issueDate: string;
    dueDate: string;
    currency: string;
    recipientName: string;
    recipientCompany: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    recipientAddress: string | null;
    notes: string | null;
    terms: string | null;
    internalNotes: string | null;
    discountType: "fixed" | "percentage" | null;
    discountValue: number | null;
    taxPercent: number | null;
    items: Array<{ description: string; quantity: number; unitPrice: number }>;
  },
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_draft_invoice", {
    p_organization_id: organizationId,
    p_invoice_id: invoiceId,
    p_payload: {
      title: input.title,
      client_id: input.clientId,
      project_id: input.projectId,
      proposal_id: input.proposalId,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      currency: input.currency,
      recipient_name: input.recipientName,
      recipient_company: input.recipientCompany,
      recipient_email: input.recipientEmail,
      recipient_phone: input.recipientPhone,
      recipient_address: input.recipientAddress,
      notes: input.notes,
      terms: input.terms,
      internal_notes: input.internalNotes,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      tax_percent: input.taxPercent,
      items: input.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
      })),
    },
  });

  if (error || !data) return null;
  return data;
}

export async function createInvoiceAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = readForm(formData);
  if (!parsed.success) {
    return actionFail("validation_error", parsed.error.issues[0]?.message ?? "Invalid invoice.");
  }
  const preview = calculateInvoiceMoney({
    lines: parsed.data.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })),
    discountType: parsed.data.discountType,
    discountValue: parsed.data.discountValue,
    taxPercent: parsed.data.taxPercent,
  });
  if (!preview.ok) return actionFail("validation_error", preview.message);

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canWriteInvoices(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const invoiceId = await saveDraft(gate.ctx.activeOrganization.organizationId, null, parsed.data);
  if (!invoiceId) return actionFail("create_failed", ACCESS_DENIED);
  refreshInvoice(invoiceId);
  return actionOk({ id: invoiceId });
}

export async function updateInvoiceAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  const parsed = readForm(formData);
  if (!id.success || !parsed.success) {
    return actionFail("validation_error", "Invalid invoice.");
  }
  const preview = calculateInvoiceMoney({
    lines: parsed.data.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })),
    discountType: parsed.data.discountType,
    discountValue: parsed.data.discountValue,
    taxPercent: parsed.data.taxPercent,
  });
  if (!preview.ok) return actionFail("validation_error", preview.message);

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canWriteInvoices(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const savedId = await saveDraft(gate.ctx.activeOrganization.organizationId, id.data.id, parsed.data);
  if (!savedId) return actionFail("update_failed", ACCESS_DENIED);
  refreshInvoice(savedId);
  return actionOk({ id: savedId });
}

export async function issueInvoiceAction(
  _prev: ActionResult<{ id: string; email?: "sent" | "failed" | "not_configured" | "skipped" }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; email?: "sent" | "failed" | "not_configured" | "skipped" }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  if (!id.success) return actionFail("validation_error", "Invalid invoice.");

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canWriteInvoices(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_invoice", {
    p_organization_id: gate.ctx.activeOrganization.organizationId,
    p_invoice_id: id.data.id,
  });
  if (error || data !== "issued") return actionFail("update_failed", ACCESS_DENIED);
  let email: "sent" | "failed" | "not_configured" | "skipped" = "skipped";
  try {
    email = await dispatchEntityEmail({
      organizationId: gate.ctx.activeOrganization.organizationId,
      template: "invoice_issued",
      entityId: id.data.id,
      subject: "Invoice available",
    });
  } catch {
    email = "failed";
  }
  refreshInvoice(id.data.id);
  return actionOk({ id: id.data.id, email });
}

export async function voidInvoiceAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  if (!id.success) return actionFail("validation_error", "Invalid invoice.");

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canWriteInvoices(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const existing = await supabase
    .from("invoices")
    .select("status, amount_paid")
    .eq("organization_id", organizationId)
    .eq("id", id.data.id)
    .maybeSingle();
  if (
    existing.error ||
    !existing.data ||
    existing.data.status !== "issued" ||
    Number(existing.data.amount_paid) !== 0
  ) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase.rpc("void_invoice", {
    p_organization_id: organizationId,
    p_invoice_id: id.data.id,
  });
  if (error || data !== "void") return actionFail("update_failed", ACCESS_DENIED);
  refreshInvoice(id.data.id);
  return actionOk({ id: id.data.id });
}

export async function deleteInvoiceAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = idSchema.safeParse({ id: formData.get("id") });
  if (!id.success) return actionFail("validation_error", "Invalid invoice.");

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canWriteInvoices(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const existing = await supabase
    .from("invoices")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("id", id.data.id)
    .maybeSingle();
  if (existing.error || !existing.data || !invoiceCanBeDeleted(existing.data.status)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const { data, error } = await supabase
    .from("invoices")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id.data.id)
    .eq("status", "draft")
    .select("id");
  if (error || !firstAffected(data)) return actionFail("delete_failed", ACCESS_DENIED);
  refreshInvoice();
  return actionOk({ id: id.data.id });
}

export async function recordPaymentAction(
  _prev: ActionResult<{ id: string; email?: "sent" | "failed" | "not_configured" | "skipped" }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; email?: "sent" | "failed" | "not_configured" | "skipped" }>> {
  const parsed = paymentFormSchema.safeParse({
    id: formData.get("id"),
    amount: formData.get("amount"),
    paymentDate: formData.get("paymentDate"),
    method: formData.get("method"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return actionFail("validation_error", parsed.error.issues[0]?.message ?? "Invalid payment.");
  }

  const gate = await getStaffContext();
  if (!gate.ok) return gate.error;
  if (!canWriteInvoices(gate.ctx.activeOrganization.role)) {
    return actionFail("forbidden", ACCESS_DENIED);
  }

  const organizationId = gate.ctx.activeOrganization.organizationId;
  const supabase = await createClient();
  const existing = await supabase
    .from("invoices")
    .select("status, total, amount_paid")
    .eq("organization_id", organizationId)
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (existing.error || !existing.data) return actionFail("forbidden", ACCESS_DENIED);
  if (existing.data.status !== "issued" && existing.data.status !== "partially_paid") {
    return actionFail("forbidden", ACCESS_DENIED);
  }
  const preview = previewPayment({
    total: Number(existing.data.total),
    amountPaid: Number(existing.data.amount_paid),
    amount: parsed.data.amount,
  });
  if (!preview.ok) return actionFail("validation_error", preview.message);

  const { data, error } = await supabase.rpc("record_invoice_payment", {
    p_organization_id: organizationId,
    p_invoice_id: parsed.data.id,
    p_amount: parsed.data.amount,
    p_payment_date: parsed.data.paymentDate,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference,
    p_notes: parsed.data.notes,
  });
  if (error || !data) return actionFail("create_failed", ACCESS_DENIED);
  let email: "sent" | "failed" | "not_configured" | "skipped" = "skipped";
  try {
    email = await dispatchEntityEmail({
      organizationId,
      template: "payment_recorded",
      entityId: parsed.data.id,
      subject: "Payment recorded",
    });
  } catch {
    email = "failed";
  }
  refreshInvoice(parsed.data.id);
  return actionOk({ id: parsed.data.id, email });
}
