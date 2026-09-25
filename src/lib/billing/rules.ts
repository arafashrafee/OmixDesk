import { calculateProposalMoney, roundMoney, type DiscountType } from "@/lib/proposals/money";

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";

export const PAYMENT_METHODS = [
  "bank_transfer",
  "cash",
  "bkash",
  "nagad",
  "card",
  "cheque",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `OMX-INV-${year}-${String(sequence).padStart(4, "0")}`;
}

export function calculateInvoiceMoney(input: {
  lines: ReadonlyArray<{ quantity: number; unitPrice: number }>;
  discountType: DiscountType;
  discountValue: number | null;
  taxPercent: number | null;
}) {
  return calculateProposalMoney(input);
}

export function isInvoiceOverdue(input: {
  status: InvoiceStatus;
  dueDate: string;
  balanceDue: number;
  today: string;
}): boolean {
  return (
    (input.status === "issued" || input.status === "partially_paid") &&
    input.dueDate < input.today &&
    input.balanceDue > 0
  );
}

export function displayInvoiceStatus(input: {
  status: InvoiceStatus;
  dueDate: string;
  balanceDue: number;
  today: string;
}): "Draft" | "Issued" | "Partial" | "Paid" | "Overdue" | "Void" {
  if (isInvoiceOverdue(input)) {
    return "Overdue";
  }
  if (input.status === "partially_paid") return "Partial";
  if (input.status === "draft") return "Draft";
  if (input.status === "issued") return "Issued";
  if (input.status === "paid") return "Paid";
  return "Void";
}

export function invoiceCanBeDeleted(status: InvoiceStatus): boolean {
  return status === "draft";
}

export function invoiceCanBeVoided(status: InvoiceStatus, amountPaid: number): boolean {
  return status === "issued" && amountPaid === 0;
}

export function invoiceAcceptsPayment(status: InvoiceStatus): boolean {
  return status === "issued" || status === "partially_paid";
}

export function balanceDue(total: number, amountPaid: number): number {
  return Math.max(roundMoney(total - amountPaid), 0);
}

export function previewPayment(input: {
  total: number;
  amountPaid: number;
  amount: number;
}):
  | { ok: true; amountPaid: number; balanceDue: number; status: "partially_paid" | "paid" }
  | { ok: false; message: string } {
  if (!(input.amount > 0)) {
    return { ok: false, message: "Payment amount must be greater than zero." };
  }
  const remaining = balanceDue(input.total, input.amountPaid);
  const amount = roundMoney(input.amount);
  if (amount > remaining) {
    return { ok: false, message: "Payment cannot exceed the remaining balance." };
  }
  const paid = roundMoney(input.amountPaid + amount);
  const due = balanceDue(input.total, paid);
  return {
    ok: true,
    amountPaid: paid,
    balanceDue: due,
    status: due === 0 ? "paid" : "partially_paid",
  };
}

/**
 * Sequential application of payment attempts against one locked invoice.
 * A later attempt that would exceed the remaining balance is rejected.
 */
export function applyPaymentSequence(
  total: number,
  amounts: readonly number[],
): { accepted: number[]; rejected: number[] } {
  let paid = 0;
  const accepted: number[] = [];
  const rejected: number[] = [];
  for (const amount of amounts) {
    const result = previewPayment({ total, amountPaid: paid, amount });
    if (!result.ok) {
      rejected.push(amount);
      continue;
    }
    paid = result.amountPaid;
    accepted.push(amount);
  }
  return { accepted, rejected };
}

export type BillingBucket = {
  currency: string;
  outstandingCount: number;
  outstandingAmount: number;
  overdueAmount: number;
  paymentsThisMonth: number;
};

export type BillingInvoice = {
  id: string;
  currency: string;
  status: InvoiceStatus;
  dueDate: string;
  balanceDue: number;
};

export type BillingPayment = {
  invoiceId: string;
  amount: number;
  paymentDate: string;
};

export function summarizeBilling(input: {
  invoices: readonly BillingInvoice[];
  payments: readonly BillingPayment[];
  today: string;
  monthStart: string;
  monthEnd: string;
}): BillingBucket[] {
  const buckets = new Map<string, BillingBucket>();
  const currencyByInvoice = new Map(input.invoices.map((invoice) => [invoice.id, invoice.currency]));

  function bucket(currency: string): BillingBucket {
    const existing = buckets.get(currency);
    if (existing) return existing;
    const created: BillingBucket = {
      currency,
      outstandingCount: 0,
      outstandingAmount: 0,
      overdueAmount: 0,
      paymentsThisMonth: 0,
    };
    buckets.set(currency, created);
    return created;
  }

  for (const invoice of input.invoices) {
    const open =
      (invoice.status === "issued" || invoice.status === "partially_paid") &&
      invoice.balanceDue > 0;
    if (!open) continue;
    const row = bucket(invoice.currency);
    row.outstandingCount += 1;
    row.outstandingAmount = roundMoney(row.outstandingAmount + invoice.balanceDue);
    if (
      isInvoiceOverdue({
        status: invoice.status,
        dueDate: invoice.dueDate,
        balanceDue: invoice.balanceDue,
        today: input.today,
      })
    ) {
      row.overdueAmount = roundMoney(row.overdueAmount + invoice.balanceDue);
    }
  }

  for (const payment of input.payments) {
    if (payment.paymentDate < input.monthStart || payment.paymentDate > input.monthEnd) continue;
    const currency = currencyByInvoice.get(payment.invoiceId);
    if (!currency) continue;
    const row = bucket(currency);
    row.paymentsThisMonth = roundMoney(row.paymentsThisMonth + payment.amount);
  }

  return [...buckets.values()].sort((left, right) => left.currency.localeCompare(right.currency));
}

/**
 * Organization-local calendar date (YYYY-MM-DD).
 * Overdue and "this month" use this date, then compare it to date columns.
 * An invalid timezone falls back to the UTC date, not the host local zone.
 */
export function calendarDate(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

export function monthBounds(date: string): { start: string; end: string } {
  const [yearText, monthText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthPadded = String(month).padStart(2, "0");
  return {
    start: `${yearText}-${monthPadded}-01`,
    end: `${yearText}-${monthPadded}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function toPrintableInvoice<T extends { internalNotes?: string; recordedBy?: string }>(
  invoice: T,
): Omit<T, "internalNotes" | "recordedBy"> {
  const printable = { ...invoice };
  delete printable.internalNotes;
  delete printable.recordedBy;
  return printable;
}
