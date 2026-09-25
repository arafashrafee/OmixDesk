import { notFound, redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { getAuthContext } from "@/lib/auth/session";
import { getInvoice, listInvoiceItems } from "@/lib/data/invoices";
import { listClientOptions, listProjects } from "@/lib/data/operations";
import { canWriteInvoices } from "@/lib/rbac";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }
  if (!canWriteInvoices(ctx.activeOrganization.role)) {
    redirect("/dashboard/invoices");
  }

  const { id } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const invoice = await getInvoice(organizationId, id);
  if (!invoice || invoice.organization_id !== organizationId) notFound();
  if (invoice.status !== "draft") redirect(`/dashboard/invoices/${invoice.id}`);

  const [items, clients, projects] = await Promise.all([
    listInvoiceItems(organizationId, invoice.id),
    listClientOptions(organizationId),
    listProjects(organizationId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Edit {invoice.invoice_number}</h1>
      <InvoiceForm
        invoice={{
          id: invoice.id,
          title: invoice.title,
          clientId: invoice.client_id,
          projectId: invoice.project_id ?? "",
          proposalId: invoice.proposal_id ?? "",
          issueDate: invoice.issue_date,
          dueDate: invoice.due_date,
          currency: invoice.currency,
          recipientName: invoice.recipient_name,
          recipientCompany: invoice.recipient_company ?? "",
          recipientEmail: invoice.recipient_email ?? "",
          recipientPhone: invoice.recipient_phone ?? "",
          recipientAddress: invoice.recipient_address ?? "",
          notes: invoice.notes ?? "",
          terms: invoice.terms ?? "",
          internalNotes: invoice.internal_notes ?? "",
          discountType: invoice.discount_type ?? "",
          discountValue: invoice.discount_value === null ? "" : String(invoice.discount_value),
          taxPercent: invoice.tax_percent === null ? "" : String(invoice.tax_percent),
          items: items.map((item) => ({
            description: item.description,
            quantity: String(item.quantity),
            unitPrice: String(item.unit_price),
          })),
        }}
        clients={clients}
        projects={(projects.ok ? projects.rows : []).map((project) => ({
          id: project.id,
          name: project.name,
          clientId: project.client_id,
        }))}
      />
    </div>
  );
}
