import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "@/lib/billing/rules";

const INVOICE_COLUMNS =
  "id, organization_id, client_id, project_id, proposal_id, invoice_number, title, status, issue_date, due_date, currency, recipient_name, recipient_company, recipient_email, recipient_phone, recipient_address, notes, terms, internal_notes, subtotal, discount_type, discount_value, discount_amount, tax_percent, tax_amount, total, amount_paid, balance_due, issued_at, paid_at, created_by, created_at, updated_at";

export async function listInvoices(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, title, client_id, project_id, status, issue_date, due_date, currency, total, amount_paid, balance_due",
    )
    .eq("organization_id", organizationId)
    .order("issue_date", { ascending: false });

  if (error || !data) {
    return { ok: false as const, rows: [] };
  }
  return { ok: true as const, rows: data };
}

export async function getInvoice(organizationId: string, invoiceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function listInvoiceItems(organizationId: string, invoiceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .select("id, description, quantity, unit_price, line_total, sort_order")
    .eq("organization_id", organizationId)
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data;
}

export async function listInvoicePayments(organizationId: string, invoiceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, amount, payment_date, payment_method, reference, notes, recorded_by, created_at")
    .eq("organization_id", organizationId)
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: true });
  if (error || !data) return [];
  return data;
}

export async function getPrintInvoice(organizationId: string, invoiceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, organization_id, invoice_number, title, status, issue_date, due_date, currency, recipient_name, recipient_company, recipient_email, recipient_phone, recipient_address, notes, terms, subtotal, discount_amount, tax_amount, total, amount_paid, balance_due",
    )
    .eq("organization_id", organizationId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function listPrintPayments(organizationId: string, invoiceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("amount, payment_date, payment_method, reference")
    .eq("organization_id", organizationId)
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: true });
  if (error || !data) return [];
  return data;
}

export async function listBillingRows(organizationId: string) {
  const supabase = await createClient();
  const invoices = await supabase
    .from("invoices")
    .select("id, currency, status, due_date, balance_due")
    .eq("organization_id", organizationId);
  const payments = await supabase
    .from("payments")
    .select("invoice_id, amount, payment_date")
    .eq("organization_id", organizationId);

  if (invoices.error || !invoices.data || payments.error || !payments.data) {
    return { ok: false as const, invoices: [], payments: [] };
  }
  return {
    ok: true as const,
    invoices: invoices.data.map((row) => ({
      id: row.id,
      currency: row.currency,
      status: row.status as InvoiceStatus,
      dueDate: row.due_date,
      balanceDue: Number(row.balance_due),
    })),
    payments: payments.data.map((row) => ({
      invoiceId: row.invoice_id,
      amount: Number(row.amount),
      paymentDate: row.payment_date,
    })),
  };
}
