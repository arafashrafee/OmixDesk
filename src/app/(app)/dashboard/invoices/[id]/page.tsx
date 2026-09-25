import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InvoiceControls } from "@/components/invoices/invoice-controls";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { calendarDate, displayInvoiceStatus, type InvoiceStatus } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import { getInvoice, listInvoiceItems, listInvoicePayments } from "@/lib/data/invoices";
import { getClient, getProject } from "@/lib/data/operations";
import { getOrganizationDocument, getProposal } from "@/lib/data/proposals";
import { canWriteInvoices } from "@/lib/rbac";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }

  const { id } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const invoice = await getInvoice(organizationId, id);
  if (!invoice || invoice.organization_id !== organizationId) notFound();

  const [items, payments, client, project, proposal, organization] = await Promise.all([
    listInvoiceItems(organizationId, invoice.id),
    listInvoicePayments(organizationId, invoice.id),
    getClient(organizationId, invoice.client_id),
    invoice.project_id ? getProject(organizationId, invoice.project_id) : Promise.resolve(null),
    invoice.proposal_id ? getProposal(organizationId, invoice.proposal_id) : Promise.resolve(null),
    getOrganizationDocument(organizationId),
  ]);
  const today = calendarDate(ctx.activeOrganization.timezone);
  const status = invoice.status as InvoiceStatus;
  const statusLabel = displayInvoiceStatus({
    status,
    dueDate: invoice.due_date,
    balanceDue: Number(invoice.balance_due),
    today,
  });
  const canWrite = canWriteInvoices(ctx.activeOrganization.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{invoice.invoice_number}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {client?.name ?? "Client"}
            {project ? ` · ${project.name}` : ""}
            {proposal ? ` · ${proposal.proposal_number}` : ""}
            {" · "}
            {statusLabel}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {canWrite && status === "draft" ? (
            <Link href={`/dashboard/invoices/${invoice.id}/edit`} className="border border-zinc-300 px-3 py-2">
              Edit
            </Link>
          ) : null}
          <Link href={`/dashboard/invoices/${invoice.id}/print`} className="border border-zinc-300 px-3 py-2">
            Print
          </Link>
        </div>
      </div>
      {canWrite ? (
        <InvoiceControls
          invoiceId={invoice.id}
          status={status}
          amountPaid={Number(invoice.amount_paid)}
          balanceDue={Number(invoice.balance_due)}
        />
      ) : null}
      {invoice.internal_notes ? (
        <section className="border border-zinc-200 bg-zinc-50 px-4 py-3">
          <h2 className="text-xs tracking-wide text-zinc-500 uppercase">Internal notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{invoice.internal_notes}</p>
        </section>
      ) : null}
      {payments.some((payment) => payment.notes) ? (
        <section className="border border-zinc-200 bg-white px-4 py-3">
          <h2 className="text-xs tracking-wide text-zinc-500 uppercase">Payment notes</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            {payments.filter((payment) => payment.notes).map((payment) => (
              <li key={payment.id}>{payment.payment_date}: {payment.notes}</li>
            ))}
          </ul>
        </section>
      ) : null}
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
