import Link from "next/link";
import { redirect } from "next/navigation";
import { displayInvoiceStatus, isInvoiceOverdue, calendarDate, type InvoiceStatus } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import { listInvoices } from "@/lib/data/invoices";
import { listClientOptions, listProjects } from "@/lib/data/operations";
import { canWriteInvoices } from "@/lib/rbac";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; clientId?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const organizationId = ctx.activeOrganization.organizationId;
  const [invoices, clients, projects] = await Promise.all([
    listInvoices(organizationId),
    listClientOptions(organizationId),
    listProjects(organizationId),
  ]);
  const today = calendarDate(ctx.activeOrganization.timezone);
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  const projectNames = new Map((projects.ok ? projects.rows : []).map((project) => [project.id, project.name]));
  const rows = invoices.ok
    ? invoices.rows.filter((invoice) => {
        if (params.clientId && invoice.client_id !== params.clientId) return false;
        if (!params.status) return true;
        if (params.status === "overdue") {
          return isInvoiceOverdue({
            status: invoice.status,
            dueDate: invoice.due_date,
            balanceDue: Number(invoice.balance_due),
            today,
          });
        }
        return invoice.status === params.status;
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Invoices</h1>
          <p className="mt-1 text-sm text-zinc-600">Drafts, issued invoices, and recorded payments.</p>
        </div>
        {canWriteInvoices(ctx.activeOrganization.role) ? (
          <Link href="/dashboard/invoices/new" className="bg-[#17356b] px-3 py-2 text-sm font-medium text-white">
            New invoice
          </Link>
        ) : null}
      </div>
      <form className="flex flex-wrap gap-3 text-sm">
        <select name="status" defaultValue={params.status ?? ""} className="border border-zinc-300 bg-white px-2 py-1.5">
          <option value="">All statuses</option>
          {(["draft", "issued", "partially_paid", "paid", "void", "overdue"] as const).map((status) => (
            <option key={status} value={status}>
              {status === "overdue" ? "Overdue" : status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select name="clientId" defaultValue={params.clientId ?? ""} className="border border-zinc-300 bg-white px-2 py-1.5">
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
        <button className="border border-zinc-300 px-3 py-1.5" type="submit">Filter</button>
      </form>
      {!invoices.ok ? (
        <p className="text-sm text-red-700">Unable to load invoices.</p>
      ) : rows.length === 0 ? (
        <p className="empty-state">No invoices match.</p>
      ) : (
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                {["Invoice", "Client", "Project", "Issued", "Due", "Total", "Paid", "Balance", "Status"].map((heading) => (
                  <th key={heading} className="px-3 py-2 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr key={invoice.id} className="border-b border-zinc-100">
                  <td className="px-3 py-3">
                    <Link href={`/dashboard/invoices/${invoice.id}`} className="font-medium text-zinc-900">
                      {invoice.invoice_number}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-zinc-600">{clientNames.get(invoice.client_id) ?? "Client"}</td>
                  <td className="px-3 py-3 text-zinc-600">{invoice.project_id ? projectNames.get(invoice.project_id) ?? "Project" : "—"}</td>
                  <td className="px-3 py-3 text-zinc-600">{invoice.issue_date}</td>
                  <td className="px-3 py-3 text-zinc-600">{invoice.due_date}</td>
                  <td className="px-3 py-3 tabular-nums">{invoice.currency} {Number(invoice.total).toFixed(2)}</td>
                  <td className="px-3 py-3 tabular-nums">{Number(invoice.amount_paid).toFixed(2)}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {invoice.status === "void" ? "—" : Number(invoice.balance_due).toFixed(2)}
                  </td>
                  <td className="px-3 py-3">
                    {displayInvoiceStatus({
                      status: invoice.status as InvoiceStatus,
                      dueDate: invoice.due_date,
                      balanceDue: Number(invoice.balance_due),
                      today,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
