import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportShell } from "@/components/reports/report-ui";
import { calendarDate } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import { canReadReports } from "@/lib/rbac";
import { loadClients } from "@/lib/reports/load";
import { resolveReportWindow } from "@/lib/reports/range";

export const dynamic = "force-dynamic";

export default async function ClientReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; page?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || !canReadReports(ctx.activeOrganization.role)) {
    redirect("/dashboard");
  }
  const params = await searchParams;
  const window = resolveReportWindow(params, calendarDate(ctx.activeOrganization.timezone));
  const page = Math.max(0, Number(params.page ?? "0") || 0);
  const report = await loadClients(ctx.activeOrganization.organizationId, page);
  const query = `range=${window.preset}${window.preset === "custom" && window.start && window.end ? `&from=${window.start}&to=${window.end}` : ""}`;

  return (
    <ReportShell
      title="Clients"
      description="Project counts are current. Accepted proposal value, invoiced amount, collected amount, and outstanding balance are lifetime figures for that client, separated by currency. The period control does not change this page. Clients are not ranked across currencies."
      window={window}
      pathname="/dashboard/reports/clients"
    >
      {!report ? <p className="text-sm text-red-700">Unable to load the client report.</p> : report.rows.length === 0 ? (
        <p className="empty-state">No clients.</p>
      ) : (
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-wide text-zinc-500 uppercase">
              <tr>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Projects</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Money</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((client) => (
                <tr key={client.id} className="border-t border-zinc-100 align-top">
                  <td className="px-3 py-3">
                    <Link href={`/dashboard/clients/${client.id}`} className="font-medium">{client.name}</Link>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{client.projects}</td>
                  <td className="px-3 py-3 tabular-nums">{client.active_projects}</td>
                  <td className="px-3 py-3">
                    {client.money.length === 0 ? "—" : client.money.map((money) => (
                      <p key={money.currency} className="tabular-nums">
                        {money.currency}: invoiced {money.invoiced}, collected {money.collected}, outstanding {money.outstanding}
                      </p>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-3 px-3 py-3 text-sm">
            {page > 0 ? <Link href={`?${query}&page=${page - 1}`}>Previous</Link> : null}
            {(page + 1) * 25 < report.total ? <Link href={`?${query}&page=${page + 1}`}>Next</Link> : null}
          </div>
        </div>
      )}
    </ReportShell>
  );
}
