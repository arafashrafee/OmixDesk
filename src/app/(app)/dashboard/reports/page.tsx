import { redirect } from "next/navigation";
import { BarList, Kpi, MoneyLines, ReportShell } from "@/components/reports/report-ui";
import { calendarDate } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import { canReadReports } from "@/lib/rbac";
import { loadOverview } from "@/lib/reports/load";
import { resolveReportWindow } from "@/lib/reports/range";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || !canReadReports(ctx.activeOrganization.role)) {
    redirect("/dashboard");
  }
  const params = await searchParams;
  const today = calendarDate(ctx.activeOrganization.timezone);
  const window = resolveReportWindow(params, today);
  const report = await loadOverview(ctx.activeOrganization.organizationId, window.start, window.end);

  return (
    <ReportShell
      title="Reports"
      description="Operational figures for this organization. Amounts stay in their own currency."
      window={window}
      pathname="/dashboard/reports"
    >
      {!report ? <p className="text-sm text-red-700">Unable to load reports.</p> : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-900">This period · {window.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Leads created" value={String(report.period_leads_created)} />
            </div>
            <MoneyLines
              empty="No accepted proposals in this period."
              rows={report.accepted_proposals.map((row) => ({
                currency: row.currency,
                lines: [["Accepted proposal value", row.amount]],
              }))}
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-900">Current</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Open leads" value={String(report.current_open_leads)} hint="Not won or lost" />
              <Kpi label="Follow-ups overdue" value={String(report.followups_overdue)} hint="Open leads only" />
              <Kpi label="Active projects" value={String(report.active_projects)} />
              <Kpi label="Projects due soon" value={String(report.projects_due_soon)} hint="Next 7 days, not completed or cancelled" />
            </div>
            <MoneyLines
              empty="No invoices."
              rows={report.billing_now.map((row) => ({
                currency: row.currency,
                lines: [
                  ["Outstanding", row.outstanding],
                  ["Overdue", row.overdue],
                  ["Collected this month", row.collected_this_month],
                ],
              }))}
            />
          </section>
          <BarList rows={[{ label: "Leads created in period", count: report.period_leads_created }]} />
        </>
      )}
    </ReportShell>
  );
}
