import { redirect } from "next/navigation";
import { BarList, Kpi, MoneyLines, ReportShell } from "@/components/reports/report-ui";
import { calendarDate } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import { canReadReports } from "@/lib/rbac";
import { loadSales } from "@/lib/reports/load";
import { PROPOSAL_STATUSES, closedRate, resolveReportWindow } from "@/lib/reports/range";

export const dynamic = "force-dynamic";

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || !canReadReports(ctx.activeOrganization.role)) {
    redirect("/dashboard");
  }
  const window = resolveReportWindow(await searchParams, calendarDate(ctx.activeOrganization.timezone));
  const report = await loadSales(ctx.activeOrganization.organizationId, window.start, window.end);
  const accepted = report?.proposal_counts.accepted ?? 0;
  const rejected = report?.proposal_counts.rejected ?? 0;
  const expired = report?.proposal_counts.expired ?? 0;
  const currencies = report
    ? [...new Set([
        ...report.payment_trend.map((row) => row.currency),
        ...report.invoice_trend.map((row) => row.currency),
      ])]
    : [];

  return (
    <ReportShell
      title="Sales and billing"
      description="Proposal counts and stored totals use issue date. Acceptance rate is accepted divided by accepted, rejected, and expired. Drafts and proposals still sent are not in that rate. Invoiced and collected follow the period. Outstanding and overdue are current balances. Void invoices are not collectible. Drafts are not invoiced."
      window={window}
      pathname="/dashboard/reports/sales"
    >
      {!report ? <p className="text-sm text-red-700">Unable to load the sales report.</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Acceptance rate" value={closedRate(accepted, accepted + rejected + expired)} hint="Accepted / (accepted + rejected + expired)" />
            <Kpi label="Invoices issued in period" value={String(report.invoice_counts.issued_in_period)} />
            <Kpi label="Paid now" value={String(report.invoice_counts.paid_now)} />
            <Kpi label="Partially paid now" value={String(report.invoice_counts.partial_now)} />
            <Kpi label="Outstanding invoices now" value={String(report.invoice_counts.outstanding_now)} />
          </div>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Proposals</h2>
            <BarList rows={PROPOSAL_STATUSES.map((status) => ({
              label: status,
              count: report.proposal_counts[status] ?? 0,
            }))} />
            <MoneyLines
              empty="No proposal totals in this period."
              rows={report.proposal_money.map((row) => ({
                currency: row.currency,
                lines: [
                  ["Open, still sent", row.open],
                  ["Accepted", row.accepted],
                  ["Rejected", row.rejected],
                ],
              }))}
            />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Billing</h2>
            <MoneyLines
              empty="No invoices."
              rows={report.billing.map((row) => ({
                currency: row.currency,
                lines: [
                  ["Invoiced in period", row.invoiced],
                  ["Collected in period", row.collected],
                  ["Outstanding now", row.outstanding_now],
                  ["Overdue now", row.overdue_now],
                ],
              }))}
            />
          </section>
          {currencies.length === 0 ? <p className="text-sm text-zinc-500">No payment or invoice trend in this period.</p> : currencies.map((currency) => (
            <section key={currency} className="space-y-2">
              <h2 className="text-sm font-semibold">{currency} · {report.grain}</h2>
              <table className="text-sm">
                <tbody>
                  {report.invoice_trend.filter((row) => row.currency === currency).map((row) => (
                    <tr key={`${row.bucket}-issued`}>
                      <td className="py-1 pr-4">Invoiced {row.bucket}</td>
                      <td className="tabular-nums">{row.amount}</td>
                    </tr>
                  ))}
                  {report.payment_trend.filter((row) => row.currency === currency).map((row) => (
                    <tr key={`${row.bucket}-paid`}>
                      <td className="py-1 pr-4">Collected {row.bucket}</td>
                      <td className="tabular-nums">{row.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </ReportShell>
  );
}
