import { redirect } from "next/navigation";
import { ProposalForm } from "@/components/proposals/proposal-form";
import { getAuthContext } from "@/lib/auth/session";
import { getClient, listClients } from "@/lib/data/operations";
import { getLead, listLeads } from "@/lib/data/leads";
import { canWriteProposals } from "@/lib/rbac";

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; clientId?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }
  if (!canWriteProposals(ctx.activeOrganization.role)) {
    redirect("/dashboard/proposals");
  }

  const organizationId = ctx.activeOrganization.organizationId;
  const params = await searchParams;
  const [leadList, clientList] = await Promise.all([
    listLeads(organizationId),
    listClients(organizationId),
  ]);
  const lead = params.leadId ? await getLead(organizationId, params.leadId) : null;
  const client = params.clientId ? await getClient(organizationId, params.clientId) : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">New proposal</h1>
      <ProposalForm
        lockSource={Boolean(lead || client)}
        leads={(leadList.ok ? leadList.rows : []).map((row) => ({ id: row.id, name: row.name }))}
        clients={clientList.ok ? clientList.rows.map((row) => ({ id: row.id, name: row.name })) : []}
        proposal={{
          title: lead ? `Proposal for ${lead.name}` : client ? `Proposal for ${client.name}` : "",
          leadId: lead?.id ?? "",
          clientId: client?.id ?? "",
          issueDate: today,
          validUntil: "",
          currency: ctx.activeOrganization.defaultCurrency,
          recipientName: lead?.name ?? client?.name ?? "",
          recipientCompany: lead?.company ?? client?.company ?? "",
          recipientEmail: lead?.email ?? client?.email ?? "",
          recipientPhone: lead?.phone ?? client?.phone ?? "",
          recipientAddress: client?.address ?? "",
          introduction: "",
          scope: "",
          terms: "",
          clientNotes: "",
          internalNotes: "",
          discountType: "",
          discountValue: "",
          taxPercent: "",
          items: [{ name: "", description: "", quantity: "1", unitPrice: "0" }],
        }}
      />
    </div>
  );
}
