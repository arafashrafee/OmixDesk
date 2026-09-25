import { notFound, redirect } from "next/navigation";
import { ProposalForm } from "@/components/proposals/proposal-form";
import { getAuthContext } from "@/lib/auth/session";
import { listClients } from "@/lib/data/operations";
import { listLeads } from "@/lib/data/leads";
import { getProposal, listProposalItems } from "@/lib/data/proposals";
import { canWriteProposals } from "@/lib/rbac";

export default async function EditProposalPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }
  if (!canWriteProposals(ctx.activeOrganization.role)) {
    redirect("/dashboard/proposals");
  }

  const { proposalId } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const proposal = await getProposal(organizationId, proposalId);
  if (!proposal) {
    notFound();
  }
  if (proposal.status !== "draft") {
    redirect(`/dashboard/proposals/${proposal.id}`);
  }

  const [items, leadList, clientList] = await Promise.all([
    listProposalItems(organizationId, proposal.id),
    listLeads(organizationId),
    listClients(organizationId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Edit {proposal.proposal_number}</h1>
      <ProposalForm
        leads={(leadList.ok ? leadList.rows : []).map((lead) => ({ id: lead.id, name: lead.name }))}
        clients={clientList.ok ? clientList.rows.map((client) => ({ id: client.id, name: client.name })) : []}
        proposal={{
          id: proposal.id,
          title: proposal.title,
          leadId: proposal.lead_id ?? "",
          clientId: proposal.client_id ?? "",
          issueDate: proposal.issue_date,
          validUntil: proposal.valid_until ?? "",
          currency: proposal.currency,
          recipientName: proposal.recipient_name,
          recipientCompany: proposal.recipient_company ?? "",
          recipientEmail: proposal.recipient_email ?? "",
          recipientPhone: proposal.recipient_phone ?? "",
          recipientAddress: proposal.recipient_address ?? "",
          introduction: proposal.introduction ?? "",
          scope: proposal.scope ?? "",
          terms: proposal.terms ?? "",
          clientNotes: proposal.client_notes ?? "",
          internalNotes: proposal.internal_notes ?? "",
          discountType: proposal.discount_type ?? "",
          discountValue: proposal.discount_value === null ? "" : String(proposal.discount_value),
          taxPercent: proposal.tax_percent === null ? "" : String(proposal.tax_percent),
          items: items.map((item) => ({
            name: item.name,
            description: item.description ?? "",
            quantity: String(item.quantity),
            unitPrice: String(item.unit_price),
          })),
        }}
      />
    </div>
  );
}
