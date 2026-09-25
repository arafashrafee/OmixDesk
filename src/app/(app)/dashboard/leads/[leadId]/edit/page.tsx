import { notFound, redirect } from "next/navigation";
import { LeadForm } from "@/components/crm/lead-form";
import { isOpenLeadStatus } from "@/lib/crm/constants";
import { followUpUtcToLocal } from "@/lib/crm/follow-up";
import { getAuthContext } from "@/lib/auth/session";
import { getLead } from "@/lib/data/leads";
import { listStaffOptions } from "@/lib/data/operations";
import { canManageLeads, canUpdateLead } from "@/lib/rbac";

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }

  const { leadId } = await params;
  const organizationId = ctx.activeOrganization.organizationId;
  const lead = await getLead(organizationId, leadId);
  if (!lead) {
    notFound();
  }

  const assignee = lead.assigned_to === ctx.userId;
  const manager = canManageLeads(ctx.activeOrganization.role);
  if (!canUpdateLead(ctx.activeOrganization.role, assignee)) {
    redirect(`/dashboard/leads/${lead.id}`);
  }
  if ((lead.status === "won" || lead.status === "lost") && !manager) {
    redirect(`/dashboard/leads/${lead.id}`);
  }

  const staff = await listStaffOptions(organizationId);
  const status = isOpenLeadStatus(lead.status) ? lead.status : "contacted";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Edit lead</h1>
      {lead.status === "won" ? (
        <p className="text-sm text-zinc-600">This lead is won. Status stays won.</p>
      ) : null}
      {lead.status === "lost" ? (
        <p className="text-sm text-zinc-600">Saving an open status reopens this lead.</p>
      ) : null}
      <LeadForm
        canAssign={manager}
        selfId={ctx.userId}
        staff={staff.map((person) => ({ userId: person.userId, label: person.label }))}
        lead={{
          id: lead.id,
          name: lead.name,
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
          source: lead.source,
          serviceInterest: lead.service_interest,
          estimatedValue: lead.estimated_value,
          status,
          priority: lead.priority,
          assignedTo: lead.assigned_to,
          nextFollowUp: followUpUtcToLocal(lead.next_follow_up_at),
          notes: lead.notes,
          lockStatus: lead.status === "won",
        }}
      />
    </div>
  );
}
