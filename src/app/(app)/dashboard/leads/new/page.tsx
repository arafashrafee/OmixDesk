import { redirect } from "next/navigation";
import { LeadForm } from "@/components/crm/lead-form";
import { getAuthContext } from "@/lib/auth/session";
import { listStaffOptions } from "@/lib/data/operations";
import { canCreateLead, canManageLeads } from "@/lib/rbac";

export default async function NewLeadPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }
  if (!canCreateLead(ctx.activeOrganization.role)) {
    redirect("/dashboard/leads");
  }

  const staff = await listStaffOptions(ctx.activeOrganization.organizationId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">New lead</h1>
      <LeadForm
        staff={staff.map((person) => ({ userId: person.userId, label: person.label }))}
        canAssign={canManageLeads(ctx.activeOrganization.role)}
        selfId={ctx.userId}
      />
    </div>
  );
}
