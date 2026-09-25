import { notFound, redirect } from "next/navigation";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { calendarDate, displayInvoiceStatus, type InvoiceStatus } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import {
  loadPortalInvoice,
  loadPortalInvoiceItems,
  loadPortalInvoicePayments,
} from "@/lib/data/portal";

export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role !== "client") {
    redirect("/login?next=/portal/invoices");
  }

  const { id } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const invoice = await loadPortalInvoice(organizationId, id);
  if (!invoice) notFound();

  const [items, payments] = await Promise.all([
    loadPortalInvoiceItems(organizationId, invoice.id),
    loadPortalInvoicePayments(organizationId, invoice.id),
  ]);
  const status = invoice.status as InvoiceStatus;
  const statusLabel = displayInvoiceStatus({
    status,
    dueDate: invoice.due_date,
    balanceDue: Number(invoice.balance_due),
    today: calendarDate(ctx.activeOrganization.timezone),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">{invoice.invoice_number}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {statusLabel}. Payments are recorded by {ctx.activeOrganization.organizationName}. There is no online payment button.
        </p>
      </div>
      <InvoiceDocument
        invoice={{
          organizationName: ctx.activeOrganization.organizationName,
          organizationEmail: null,
          organizationPhone: null,
          organizationAddress: null,
          organizationWebsite: null,
          invoiceNumber: invoice.invoice_number,
          title: invoice.title,
          statusLabel,
          issueDate: invoice.issue_date,
          dueDate: invoice.due_date,
          currency: invoice.currency,
          recipientName: invoice.recipient_name,
          recipientCompany: invoice.recipient_company,
          recipientEmail: null,
          recipientPhone: null,
          recipientAddress: null,
          notes: invoice.notes,
          terms: invoice.terms,
          subtotal: Number(invoice.subtotal),
          discountAmount: Number(invoice.discount_amount),
          taxAmount: Number(invoice.tax_amount),
          total: Number(invoice.total),
          amountPaid: Number(invoice.amount_paid),
          balanceDue: Number(invoice.balance_due),
          items: items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unit_price),
            lineTotal: Number(item.line_total),
          })),
          payments: payments.map((payment) => ({
            amount: Number(payment.amount),
            paymentDate: payment.payment_date,
            method: payment.payment_method,
            reference: payment.reference,
          })),
        }}
      />
    </div>
  );
}
