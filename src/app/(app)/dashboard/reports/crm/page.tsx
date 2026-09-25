import { redirect } from "next/navigation";
import { BarList, Kpi, ReportShell } from "@/components/reports/report-ui";
import { calendarDate } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import { canReadReports } from "@/lib/rbac";
import { loadCrm } from "@/lib/reports/load";
import { LEAD_STAGES, closedRate, resolveReportWindow } from "@/lib/reports/range";

export const dynamic = "force-dynamic";

export default async function CrmReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || !canReadReports(ctx.activeOrganization.role)) {
    redirect("/dashboard");
  }
  const window = resolveReportWindow(await searchParams, calendarDate(ctx.activeOrganization.timezone));
  const report = await loadCrm(ctx.activeOrganization.organizationId, window.start, window.end);
  const pipeline = LEAD_STAGES.map((stage) => ({ label: stage.replaceAll("_", " "), count: report?.pipeline[stage] ?? 0 }));
  const won = report?.pipeline.won ?? 0;
  const lost = report?.pipeline.lost ?? 0;

  return (
    <ReportShell
      title="CRM"
      description="Counts are leads created in the selected period. Conversion rate is won divided by won plus lost in that period. Follow-ups are the current open pipeline."
      window={window}
      pathname="/dashboard/reports/crm"
    >
      {!report ? <p className="text-sm text-red-700">Unable to load the CRM report.</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Created" value={String(pipeline.reduce((sum, row) => sum + row.count, 0))} />
            <Kpi label="Won" value={String(won)} />
            <Kpi label="Lost" value={String(lost)} />
            <Kpi label="Conversion rate" value={closedRate(won, won + lost)} hint="Won / (won + lost). Open leads are excluded." />
            <Kpi label="Follow-ups due today" value={String(report.followups.due_today)} hint="Current open leads" />
            <Kpi label="Follow-ups overdue" value={String(report.followups.overdue)} hint="Current open leads" />
            <Kpi label="Follow-ups in 7 days" value={String(report.followups.upcoming)} hint="Current open leads" />
          </div>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Pipeline</h2>
            <BarList rows={pipeline} />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Sources</h2>
            <p className="text-xs text-zinc-500">Blank sources are shown as Unspecified. Different spellings stay separate. Conversion here is won count for that source, not a percentage.</p>
            {report.sources.length === 0 ? <p className="empty-state">No leads in this period.</p> : (
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs text-zinc-500 uppercase"><tr><th className="py-2">Source</th><th>Leads</th><th>Won</th></tr></thead>
                <tbody>
                  {report.sources.map((source) => (
                    <tr key={source.source} className="border-t border-zinc-100">
                      <td className="py-2">{source.source}</td>
                      <td className="tabular-nums">{source.count}</td>
                      <td className="tabular-nums">{source.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Lost reasons</h2>
            <p className="text-xs text-zinc-500">Exact stored text. Similar reasons are not merged.</p>
            {report.lost_reasons.length === 0 ? <p className="empty-state">No lost leads in this period.</p> : (
              <BarList rows={report.lost_reasons.map((reason) => ({ label: reason.reason, count: reason.count }))} />
            )}
          </section>
        </>
      )}
    </ReportShell>
  );
}
