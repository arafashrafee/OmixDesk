import { notFound, redirect } from "next/navigation";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { PrintButton } from "@/components/proposals/print-button";
import { calendarDate, displayInvoiceStatus, type InvoiceStatus } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import { getPrintInvoice, listInvoiceItems, listPrintPayments } from "@/lib/data/invoices";
import { getOrganizationDocument } from "@/lib/data/proposals";

export default async function PrintInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/login?next=/dashboard/invoices");
  }

  const { id } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const invoice = await getPrintInvoice(organizationId, id);
  if (!invoice) notFound();

  const [items, payments, organization] = await Promise.all([
    listInvoiceItems(organizationId, invoice.id),
    listPrintPayments(organizationId, invoice.id),
    getOrganizationDocument(organizationId),
  ]);
  const statusLabel = displayInvoiceStatus({
    status: invoice.status as InvoiceStatus,
    dueDate: invoice.due_date,
    balanceDue: Number(invoice.balance_due),
    today: calendarDate(ctx.activeOrganization.timezone),
  });

  return (
    <div className="mx-auto max-w-[210mm] bg-white px-8 py-10 text-zinc-900 print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          .workspace-topbar, .workspace-sidebar { display: none !important; }
          main { max-width: none !important; padding: 0 !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <InvoiceDocument
        invoice={{
          organizationName: organization?.name ?? ctx.activeOrganization.organizationName,
          organizationEmail: organization?.email ?? null,
          organizationPhone: organization?.phone ?? null,
          organizationAddress: organization?.address ?? null,
          organizationWebsite: organization?.website ?? null,
          invoiceNumber: invoice.invoice_number,
          title: invoice.title,
          statusLabel,
          issueDate: invoice.issue_date,
          dueDate: invoice.due_date,
          currency: invoice.currency,
          recipientName: invoice.recipient_name,
          recipientCompany: invoice.recipient_company,
          recipientEmail: invoice.recipient_email,
          recipientPhone: invoice.recipient_phone,
          recipientAddress: invoice.recipient_address,
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
