import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPaymentSequence,
  balanceDue,
  calendarDate,
  calculateInvoiceMoney,
  displayInvoiceStatus,
  formatInvoiceNumber,
  invoiceAcceptsPayment,
  invoiceCanBeDeleted,
  invoiceCanBeVoided,
  isInvoiceOverdue,
  monthBounds,
  previewPayment,
  summarizeBilling,
  toPrintableInvoice,
} from "@/lib/billing/rules";
import { canReadInvoices, canWriteInvoices } from "@/lib/rbac";
import { invoiceFormSchema } from "@/lib/validations/invoices";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260925000004_phase6_billing.sql"),
  "utf8",
);

describe("invoice permissions", () => {
  it("lets every staff role read and only managers write", () => {
    for (const role of ["owner", "admin", "project_manager", "member"] as const) {
      expect(canReadInvoices(role)).toBe(true);
    }
    expect(canWriteInvoices("owner")).toBe(true);
    expect(canWriteInvoices("admin")).toBe(true);
    expect(canWriteInvoices("project_manager")).toBe(true);
    expect(canWriteInvoices("member")).toBe(false);
    expect(canReadInvoices("client")).toBe(false);
    expect(canWriteInvoices("client")).toBe(false);
  });
});

describe("invoice lifecycle and overdue", () => {
  it("derives overdue without treating it as a stored status", () => {
    expect(sql).toContain("'draft',\n  'issued'");
    expect(sql).not.toContain("'overdue'");
    const open = {
      status: "issued" as const,
      dueDate: "2026-09-01",
      balanceDue: 10,
      today: "2026-09-25",
    };
    expect(isInvoiceOverdue(open)).toBe(true);
    expect(displayInvoiceStatus(open)).toBe("Overdue");
    expect(displayInvoiceStatus({ ...open, status: "partially_paid" })).toBe("Overdue");
    expect(isInvoiceOverdue({ ...open, status: "paid", balanceDue: 0 })).toBe(false);
    expect(isInvoiceOverdue({ ...open, status: "void" })).toBe(false);
    expect(isInvoiceOverdue({ ...open, status: "draft" })).toBe(false);
    expect(isInvoiceOverdue({ ...open, dueDate: "2026-09-25" })).toBe(false);
    expect(invoiceCanBeDeleted("draft")).toBe(true);
    expect(invoiceCanBeDeleted("issued")).toBe(false);
    expect(invoiceCanBeVoided("issued", 0)).toBe(true);
    expect(invoiceCanBeVoided("issued", 10)).toBe(false);
    expect(invoiceCanBeVoided("partially_paid", 0)).toBe(false);
    expect(invoiceCanBeVoided("paid", 0)).toBe(false);
    expect(invoiceAcceptsPayment("draft")).toBe(false);
    expect(invoiceAcceptsPayment("void")).toBe(false);
    expect(invoiceAcceptsPayment("paid")).toBe(false);
    expect(invoiceAcceptsPayment("issued")).toBe(true);
    expect(invoiceAcceptsPayment("partially_paid")).toBe(true);
  });
});

describe("invoice money and payments", () => {
  it("rounds lines and rejects an excessive fixed discount", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("OMX-INV-2026-0001");
    const priced = calculateInvoiceMoney({
      lines: [{ quantity: 1.5, unitPrice: 10.1 }],
      discountType: "fixed",
      discountValue: 100,
      taxPercent: null,
    });
    expect(priced.ok).toBe(false);
  });

  it("applies percentage discount and tax", () => {
    const priced = calculateInvoiceMoney({
      lines: [{ quantity: 2, unitPrice: 100 }],
      discountType: "percentage",
      discountValue: 10,
      taxPercent: 5,
    });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.totals.lineTotals).toEqual([200]);
    expect(priced.totals.subtotal).toBe(200);
    expect(priced.totals.discountAmount).toBe(20);
    expect(priced.totals.taxAmount).toBe(9);
    expect(priced.totals.total).toBe(189);
  });

  it("keeps partial and final payments inside the balance", () => {
    const partial = previewPayment({ total: 100, amountPaid: 0, amount: 40 });
    expect(partial.ok && partial.status).toBe("partially_paid");
    expect(partial.ok && partial.balanceDue).toBe(60);
    const finalPayment = previewPayment({ total: 100, amountPaid: 40, amount: 60 });
    expect(finalPayment.ok && finalPayment.status).toBe("paid");
    expect(finalPayment.ok && finalPayment.balanceDue).toBe(0);
    expect(previewPayment({ total: 100, amountPaid: 40, amount: 60.01 }).ok).toBe(false);
    expect(previewPayment({ total: 100, amountPaid: 100, amount: 1 }).ok).toBe(false);
    expect(previewPayment({ total: 100, amountPaid: 0, amount: 0 }).ok).toBe(false);
    expect(balanceDue(100, 100)).toBe(0);
    const sequence = applyPaymentSequence(100, [70, 40, 30]);
    expect(sequence.accepted).toEqual([70, 30]);
    expect(sequence.rejected).toEqual([40]);
  });

  it("groups dashboard money by currency and skips non-collectible invoices", () => {
    const buckets = summarizeBilling({
      today: "2026-09-25",
      monthStart: "2026-09-01",
      monthEnd: "2026-09-30",
      invoices: [
        { id: "usd-open", currency: "USD", status: "issued", dueDate: "2026-09-01", balanceDue: 25 },
        { id: "usd-void", currency: "USD", status: "void", dueDate: "2026-09-01", balanceDue: 80 },
        { id: "bdt-open", currency: "BDT", status: "partially_paid", dueDate: "2026-10-01", balanceDue: 500 },
        { id: "usd-draft", currency: "USD", status: "draft", dueDate: "2026-09-01", balanceDue: 10 },
      ],
      payments: [
        { invoiceId: "usd-open", amount: 10, paymentDate: "2026-09-12" },
        { invoiceId: "bdt-open", amount: 40, paymentDate: "2026-08-31" },
      ],
    });
    expect(buckets).toEqual([
      {
        currency: "BDT",
        outstandingCount: 1,
        outstandingAmount: 500,
        overdueAmount: 0,
        paymentsThisMonth: 0,
      },
      {
        currency: "USD",
        outstandingCount: 1,
        outstandingAmount: 25,
        overdueAmount: 25,
        paymentsThisMonth: 10,
      },
    ]);
    expect(calendarDate("UTC", new Date("2026-09-24T20:00:00Z"))).toBe("2026-09-24");
    expect(calendarDate("Asia/Dhaka", new Date("2026-09-24T20:00:00Z"))).toBe("2026-09-25");
    expect(calendarDate("Not/AZone", new Date("2026-09-24T20:00:00Z"))).toBe("2026-09-24");
    expect(monthBounds("2024-02-10")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(isInvoiceOverdue({
      status: "issued",
      dueDate: "2026-09-24",
      balanceDue: 1,
      today: calendarDate("Asia/Dhaka", new Date("2026-09-24T20:00:00Z")),
    })).toBe(true);
  });

  it("omits internal notes from the printable model", () => {
    const printable = toPrintableInvoice({
      invoiceNumber: "OMX-INV-2026-0001",
      internalNotes: "staff only",
      recordedBy: "user-1",
      notes: "please pay",
    });
    expect(printable).not.toHaveProperty("internalNotes");
    expect(printable).not.toHaveProperty("recordedBy");
    expect(JSON.stringify(printable)).not.toContain("staff only");
  });
});

describe("invoice form", () => {
  it("requires a client and a due date on or after the issue date", () => {
    const parsed = invoiceFormSchema.safeParse({
      title: "September",
      clientId: "",
      projectId: "",
      proposalId: "",
      issueDate: "2026-09-25",
      dueDate: "2026-09-01",
      currency: "bdt",
      recipientName: "Ada",
      recipientCompany: "",
      recipientEmail: "",
      recipientPhone: "",
      recipientAddress: "",
      notes: "",
      terms: "",
      internalNotes: "",
      discountType: "",
      discountValue: "",
      taxPercent: "",
      items: [{ description: "Design", quantity: 1, unitPrice: 10 }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("phase 6 migration security contract", () => {
  it("forces RLS, withholds counters and authoritative columns, and keeps payments immutable", () => {
    for (const table of ["invoices", "invoice_items", "payments", "invoice_number_counters"]) {
      expect(sql).toContain(`alter table public.${table} force row level security`);
    }
    expect(sql).toContain("revoke all on table public.invoice_number_counters from public, anon, authenticated");
    expect(sql).toContain("on conflict (organization_id, year)");
    expect(sql).toContain("'OMX-INV-'");
    expect(sql).toContain("new.line_total := round(new.quantity * new.unit_price, 2)");
    expect(sql).toContain("new.amount_paid := v_paid");
    expect(sql).toContain("for update");
    expect(sql).toContain("revoke all on table public.invoices from public, anon, authenticated");
    expect(sql).toContain("revoke all on table public.invoice_items from public, anon, authenticated");
    expect(sql).toContain("revoke all on table public.payments from public, anon, authenticated");
    expect(sql).toContain("grant select, delete on table public.invoices to authenticated");
    expect(sql).toContain("grant select on table public.invoice_items to authenticated");
    expect(sql).toContain("grant select on table public.payments to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete) on table public\.payments/i);
    expect(sql).not.toMatch(/grant (insert|update|delete) on table public\.invoice_items/i);
    expect(sql).not.toMatch(/grant (insert|update) on table public\.invoices/i);
    expect(sql).not.toMatch(/on public\.payments for (insert|update|delete)/);
    expect(sql).toContain("invoices_delete_draft");
    expect(sql).toContain("old.status <> 'draft'::public.invoice_status");
    expect(sql).toContain("public.client_mapped_to(invoice.organization_id, invoice.client_id)");
    expect(sql).toContain("invoice.status <> 'draft'");
    expect(sql).toContain("v_proposal_status is distinct from 'accepted'");
    expect(sql).toContain("lead.converted_client_id");
    expect(sql).toContain("new.total <= 0 or v_paid <> new.total");
    expect(sql).toContain("internal_notes is distinct from old.internal_notes");
    expect(sql).not.toMatch(/unique \(proposal_id\)/i);
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/grant insert \(/);
    expect(sql).not.toMatch(/grant update \(/);

    for (const name of [
      "allocate_invoice_number(uuid, integer)",
      "assign_invoice_number()",
      "apply_invoice_totals()",
      "enforce_invoice_lifecycle()",
      "prepare_invoice_item()",
      "refresh_invoice_from_items()",
      "enforce_invoice_context()",
      "guard_invoice_item_delete()",
      "client_can_read_invoice(uuid)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${name} from public, anon, authenticated`);
      expect(sql).not.toContain(`grant execute on function public.${name} to authenticated`);
    }

    expect(sql).toContain("grant execute on function public.save_draft_invoice(uuid, uuid, jsonb) to authenticated");
    expect(sql).toContain("grant execute on function public.issue_invoice(uuid, uuid) to authenticated");
    expect(sql).toContain("grant execute on function public.void_invoice(uuid, uuid) to authenticated");
    expect(sql).toContain("grant execute on function public.record_invoice_payment(uuid, uuid, numeric, date, text, text, text) to authenticated");
    expect(sql).toContain("grant execute on function public.portal_invoice_payments(uuid, uuid) to authenticated");

    const portalPayments = sql.slice(
      sql.indexOf("function public.portal_invoice_payments"),
      sql.indexOf("revoke all on function public.can_manage_invoices"),
    );
    expect(portalPayments).not.toContain("recorded_by");
    expect(portalPayments).not.toContain("notes");
    const portalInvoice = sql.slice(
      sql.indexOf("function public.portal_invoice("),
      sql.indexOf("function public.portal_invoice_items"),
    );
    expect(portalInvoice).not.toContain("internal_notes");
    expect(portalInvoice).not.toContain("created_by");
  });

  it("replaces items before applying discount inside one function", () => {
    const save = sql.slice(
      sql.indexOf("function public.save_draft_invoice"),
      sql.indexOf("function public.issue_invoice"),
    );
    const clear = save.indexOf("discount_type = null");
    const replaceItems = save.indexOf("delete from public.invoice_items");
    const insertItems = save.lastIndexOf("insert into public.invoice_items");
    const applyDiscount = save.lastIndexOf("discount_type = v_discount_type");
    expect(clear).toBeGreaterThan(0);
    expect(clear).toBeLessThan(replaceItems);
    expect(replaceItems).toBeLessThan(insertItems);
    expect(insertItems).toBeLessThan(applyDiscount);
    expect(save).toContain("for update");
    expect(save).toContain("proposal.status = 'accepted'");
    expect(save).toContain("auth.uid()");
    expect(save).not.toContain("subtotal");
    expect(save).not.toContain("invoice_number");
  });

  it("records a payment in one locked status update and rejects a completing touch update", () => {
    const payment = sql.slice(
      sql.indexOf("function public.record_invoice_payment"),
      sql.indexOf("function public.client_can_read_invoice"),
    );
    const issue = sql.slice(
      sql.indexOf("function public.issue_invoice"),
      sql.indexOf("function public.void_invoice"),
    );
    const voiding = sql.slice(
      sql.indexOf("function public.void_invoice"),
      sql.indexOf("function public.record_invoice_payment"),
    );
    expect(payment.indexOf("for update")).toBeLessThan(payment.indexOf("insert into public.payments"));
    expect(payment).toContain("round(p_amount, 2) > (v_invoice.total - v_paid)");
    expect(payment).not.toContain("set updated_at = now()");
    expect(payment.indexOf("insert into public.payments")).toBeLessThan(payment.indexOf("set status = case"));
    expect(payment).toContain("can_manage_invoices");
    expect(issue).toContain("for update");
    expect(issue).toContain("status = 'draft'");
    expect(voiding).toContain("for update");
    expect(voiding).toContain("invoice.amount_paid = 0");
    expect(voiding).toContain("status = 'issued'");
    expect(sql).toContain("'owner'::public.org_role");
    expect(sql).toContain("'project_manager'::public.org_role");
    expect(sql).not.toContain("'member'::public.org_role");
    expect(sql).not.toContain("join public.client_users");
    expect(sql).toContain("on delete restrict");
    expect(sql).toContain("constraint payments_invoice_same_org");
  });
});
