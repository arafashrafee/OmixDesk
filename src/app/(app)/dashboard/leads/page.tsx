import Link from "next/link";
import { redirect } from "next/navigation";
import { OPEN_LEAD_STATUSES, LEAD_PRIORITIES } from "@/lib/crm/constants";
import { followUpState, formatFollowUpUtc } from "@/lib/crm/follow-up";
import { labelize } from "@/components/operations/styles";
import { getAuthContext } from "@/lib/auth/session";
import { listLeads } from "@/lib/data/leads";
import { listStaffOptions } from "@/lib/data/operations";
import { canCreateLead } from "@/lib/rbac";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    assigned?: string;
    q?: string;
  }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const leads = await listLeads(ctx.activeOrganization.organizationId);
  const staff = await listStaffOptions(ctx.activeOrganization.organizationId);
  const staffById = new Map(staff.map((person) => [person.userId, person.label]));
  const query = params.q?.trim().toLowerCase() ?? "";
  const now = new Date();

  const rows = leads.ok
    ? leads.rows.filter((lead) => {
        if (params.status && lead.status !== params.status) return false;
        if (params.priority && lead.priority !== params.priority) return false;
        if (params.assigned === "unassigned" && lead.assigned_to) return false;
        if (
          params.assigned &&
          params.assigned !== "unassigned" &&
          lead.assigned_to !== params.assigned
        ) {
          return false;
        }
        if (!query) return true;
        const haystack = [lead.name, lead.company, lead.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : [];

  const pipeline = OPEN_LEAD_STATUSES.map((status) => ({
    status,
    rows: (leads.ok ? leads.rows : []).filter((lead) => lead.status === status),
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Leads</h1>
          <p className="mt-1 text-sm text-zinc-600">Open opportunities before they become clients.</p>
        </div>
        {canCreateLead(ctx.activeOrganization.role) ? (
          <Link href="/dashboard/leads/new" className="bg-zinc-900 px-3 py-2 text-sm font-medium text-white">
            New lead
          </Link>
        ) : null}
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        {pipeline.map((column) => (
          <div key={column.status} className="border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-3 py-2 text-xs tracking-wide text-zinc-500 uppercase">
              {labelize(column.status)} · {column.rows.length}
            </div>
            <ul className="divide-y divide-zinc-100">
              {column.rows.slice(0, 8).map((lead) => (
                <li key={lead.id} className="px-3 py-2">
                  <Link href={`/dashboard/leads/${lead.id}`} className="text-sm font-medium text-zinc-900">
                    {lead.name}
                  </Link>
                  <p className="text-xs text-zinc-500">{lead.company ?? "No company"}</p>
                </li>
              ))}
              {column.rows.length === 0 ? (
                <li className="px-3 py-3 text-xs text-zinc-400">None</li>
              ) : null}
            </ul>
          </div>
        ))}
      </section>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-zinc-500">Status</span>
          <select name="status" defaultValue={params.status ?? ""} className="border border-zinc-300 bg-white px-2 py-1.5">
            <option value="">All</option>
            {["new", "contacted", "qualified", "proposal", "won", "lost"].map((status) => (
              <option key={status} value={status}>{labelize(status)}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-zinc-500">Priority</span>
          <select name="priority" defaultValue={params.priority ?? ""} className="border border-zinc-300 bg-white px-2 py-1.5">
            <option value="">All</option>
            {LEAD_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-zinc-500">Assignee</span>
          <select name="assigned" defaultValue={params.assigned ?? ""} className="border border-zinc-300 bg-white px-2 py-1.5">
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {staff.map((person) => (
              <option key={person.userId} value={person.userId}>{person.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-zinc-500">Search</span>
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name, company, email"
            className="border border-zinc-300 bg-white px-2 py-1.5"
          />
        </label>
        <button type="submit" className="border border-zinc-300 px-3 py-1.5">Filter</button>
      </form>

      {!leads.ok ? (
        <p className="text-sm text-red-700">Unable to load leads.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No leads match.</p>
      ) : (
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Lead</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Assigned</th>
                <th className="px-3 py-2 font-medium">Follow-up</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                const followUp = followUpState(lead.next_follow_up_at, now);
                const open = lead.status !== "won" && lead.status !== "lost";
                return (
                  <tr key={lead.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-3">
                      <Link href={`/dashboard/leads/${lead.id}`} className="font-medium text-zinc-900">
                        {lead.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{lead.company ?? "—"}</td>
                    <td className="px-3 py-3 text-zinc-600">{labelize(lead.status)}</td>
                    <td className="px-3 py-3 text-zinc-600">{lead.priority}</td>
                    <td className="px-3 py-3 text-zinc-600">{lead.service_interest ?? "—"}</td>
                    <td className="px-3 py-3 text-zinc-600">{lead.estimated_value ?? "—"}</td>
                    <td className="px-3 py-3 text-zinc-600">
                      {lead.assigned_to ? (staffById.get(lead.assigned_to) ?? "Staff") : "—"}
                    </td>
                    <td className={`px-3 py-3 ${open && followUp === "overdue" ? "text-red-700" : "text-zinc-600"}`}>
                      {lead.next_follow_up_at
                        ? `${followUp === "overdue" && open ? "Overdue · " : ""}${formatFollowUpUtc(lead.next_follow_up_at)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{lead.created_at.slice(0, 10)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
