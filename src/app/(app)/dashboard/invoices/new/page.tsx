import { redirect } from "next/navigation";
import { InvoiceForm, type InvoiceFormValues } from "@/components/invoices/invoice-form";
import { calendarDate } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import { getLead } from "@/lib/data/leads";
import { getClient, listClientOptions, listProjects } from "@/lib/data/operations";
import { getProposal, listProposalItems } from "@/lib/data/proposals";
import { canWriteInvoices } from "@/lib/rbac";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; projectId?: string; proposalId?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }
  if (!canWriteInvoices(ctx.activeOrganization.role)) {
    redirect("/dashboard/invoices");
  }

  const organizationId = ctx.activeOrganization.organizationId;
  const params = await searchParams;
  const [clients, projects, proposal] = await Promise.all([
    listClientOptions(organizationId),
    listProjects(organizationId),
    params.proposalId ? getProposal(organizationId, params.proposalId) : Promise.resolve(null),
  ]);
  const projectRows = projects.ok ? projects.rows : [];
  const selectedProject = params.projectId
    ? projectRows.find((project) => project.id === params.projectId) ?? null
    : null;

  let blocked: string | null = null;
  let clientId = params.clientId ?? selectedProject?.client_id ?? "";
  let values: InvoiceFormValues | undefined;

  if (params.proposalId) {
    if (!proposal || proposal.status !== "accepted") {
      blocked = "Only an accepted proposal can prefill an invoice.";
    } else {
      const lead = proposal.lead_id ? await getLead(organizationId, proposal.lead_id) : null;
      const resolvedClientId = proposal.client_id ?? lead?.converted_client_id ?? null;
      if (!resolvedClientId) {
        blocked = "Convert the lead to a client before creating an invoice. Nothing has been created yet.";
      } else if (selectedProject && selectedProject.client_id !== resolvedClientId) {
        blocked = "That project belongs to a different client.";
      } else {
        const items = await listProposalItems(organizationId, proposal.id);
        clientId = resolvedClientId;
        const today = calendarDate(ctx.activeOrganization.timezone);
        values = {
          title: proposal.title,
          clientId: resolvedClientId,
          projectId: selectedProject?.id ?? "",
          proposalId: proposal.id,
          issueDate: today,
          dueDate: today,
          currency: proposal.currency,
          recipientName: proposal.recipient_name,
          recipientCompany: proposal.recipient_company ?? "",
          recipientEmail: proposal.recipient_email ?? "",
          recipientPhone: proposal.recipient_phone ?? "",
          recipientAddress: proposal.recipient_address ?? "",
          notes: proposal.client_notes ?? "",
          terms: proposal.terms ?? "",
          internalNotes: "",
          discountType: proposal.discount_type ?? "",
          discountValue: proposal.discount_value === null ? "" : String(proposal.discount_value),
          taxPercent: proposal.tax_percent === null ? "" : String(proposal.tax_percent),
          items: (items.length > 0 ? items : [{ name: "", description: null, quantity: 1, unit_price: 0 }]).map((item) => ({
            description: item.description ? `${item.name} — ${item.description}` : item.name,
            quantity: String(item.quantity),
            unitPrice: String(item.unit_price),
          })),
        };
      }
    }
  } else if (clientId) {
    const client = await getClient(organizationId, clientId);
    const today = calendarDate(ctx.activeOrganization.timezone);
    values = {
      title: selectedProject ? selectedProject.name : "",
      clientId,
      projectId: selectedProject?.id ?? "",
      proposalId: "",
      issueDate: today,
      dueDate: today,
      currency: ctx.activeOrganization.defaultCurrency,
      recipientName: client?.name ?? "",
      recipientCompany: client?.company ?? "",
      recipientEmail: client?.email ?? "",
      recipientPhone: client?.phone ?? "",
      recipientAddress: client?.address ?? "",
      notes: "",
      terms: "",
      internalNotes: "",
      discountType: "",
      discountValue: "",
      taxPercent: "",
      items: [{ description: "", quantity: "1", unitPrice: "0" }],
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">New invoice</h1>
        <p className="mt-1 text-sm text-zinc-600">Saving creates a draft. Issue it when it is ready to share.</p>
      </div>
      {blocked ? <p className="text-sm text-zinc-700">{blocked}</p> : null}
      {blocked ? null : (
        <InvoiceForm
          {...(values ? { invoice: values } : {})}
          clients={clients}
          projects={projectRows.map((project) => ({
            id: project.id,
            name: project.name,
            clientId: project.client_id,
          }))}
        />
      )}
    </div>
  );
}
