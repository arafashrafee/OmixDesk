import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LeadActions } from "@/components/crm/lead-actions";
import { labelize } from "@/components/operations/styles";
import { followUpState, formatFollowUpUtc } from "@/lib/crm/follow-up";
import { getAuthContext } from "@/lib/auth/session";
import { getLead, listLeadActivities } from "@/lib/data/leads";
import { listStaffOptions } from "@/lib/data/operations";
import { canChangeLeadStatus } from "@/lib/crm/transitions";
import { canConvertLead, canManageLeads, canUpdateLead, canWriteProposals } from "@/lib/rbac";

export default async function LeadDetailPage({
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
  if (!lead || lead.organization_id !== organizationId) {
    notFound();
  }

  const [staff, activities] = await Promise.all([
    listStaffOptions(organizationId),
    listLeadActivities(organizationId, lead.id),
  ]);
  const staffById = new Map(staff.map((person) => [person.userId, person.label]));
  const role = ctx.activeOrganization.role;
  const assignee = lead.assigned_to === ctx.userId;
  const canEdit = canUpdateLead(role, assignee) && (lead.status === "won" || lead.status === "lost" ? canManageLeads(role) : true);
  const followUp = followUpState(lead.next_follow_up_at, new Date());
  const open = lead.status !== "won" && lead.status !== "lost";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-wide text-zinc-500 uppercase">Lead</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">{lead.name}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {labelize(lead.status)} · {lead.priority} priority
          </p>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <Link href={`/dashboard/leads/${lead.id}/edit`} className="border border-zinc-300 px-3 py-2 text-sm">
              Edit
            </Link>
            {canWriteProposals(role) ? (
              <Link href={`/dashboard/proposals/new?leadId=${lead.id}`} className="border border-zinc-300 px-3 py-2 text-sm">
                Create proposal
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {lead.converted_client_id ? (
        <p className="border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
          Converted to client.{" "}
          <Link href={`/dashboard/clients/${lead.converted_client_id}`} className="font-medium underline">
            View client
          </Link>
        </p>
      ) : null}

      <section className="grid gap-4 border border-zinc-200 bg-white p-4 sm:grid-cols-2">
        <Field label="Company" value={lead.company} />
        <Field label="Email" value={lead.email} />
        <Field label="Phone" value={lead.phone} />
        <Field label="Source" value={lead.source} />
        <Field label="Service" value={lead.service_interest} />
        <Field label="Estimated value" value={lead.estimated_value?.toString() ?? null} />
        <Field label="Assigned to" value={lead.assigned_to ? (staffById.get(lead.assigned_to) ?? "Staff") : null} />
        <Field
          label="Next follow-up"
          value={
            lead.next_follow_up_at
              ? `${open && followUp === "overdue" ? "Overdue · " : ""}${formatFollowUpUtc(lead.next_follow_up_at)}`
              : null
          }
        />
      </section>

      {lead.lost_reason ? (
        <section>
          <h2 className="text-sm font-semibold text-zinc-900">Lost reason</h2>
          <p className="mt-1 text-sm text-zinc-700">{lead.lost_reason}</p>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold text-zinc-900">Notes</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{lead.notes || "No notes."}</p>
      </section>

      <LeadActions
        leadId={lead.id}
        status={lead.status}
        canChangeOpenStatus={canChangeLeadStatus({
          role,
          isAssignee: assignee,
          from: lead.status,
          to: lead.status === "new" ? "contacted" : "new",
        })}
        canManage={canManageLeads(role)}
        canConvert={canConvertLead(role)}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">Activity</h2>
        {activities.length === 0 ? (
          <p className="empty-state">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {activities.map((activity) => (
              <li key={activity.id} className="border border-zinc-200 bg-white px-4 py-3">
                <p className="text-xs text-zinc-500">
                  {labelize(activity.activity_type)} · {formatFollowUpUtc(activity.created_at)} ·{" "}
                  {staffById.get(activity.created_by) ?? "Staff"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{activity.content}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 text-sm text-zinc-900">{value || "—"}</p>
    </div>
  );
}
