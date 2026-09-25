import { redirect } from "next/navigation";
import { BarList, Kpi, ReportShell } from "@/components/reports/report-ui";
import { calendarDate } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import { canReadReports } from "@/lib/rbac";
import { loadProjects } from "@/lib/reports/load";
import { PROJECT_STATUSES, resolveReportWindow } from "@/lib/reports/range";

export const dynamic = "force-dynamic";

export default async function ProjectReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || !canReadReports(ctx.activeOrganization.role)) {
    redirect("/dashboard");
  }
  const window = resolveReportWindow(await searchParams, calendarDate(ctx.activeOrganization.timezone));
  const report = await loadProjects(ctx.activeOrganization.organizationId);

  return (
    <ReportShell
      title="Projects"
      description="Current portfolio. The period control is shared with other reports and does not change these figures. Overdue means the deadline is before today and the project is not completed or cancelled. Due soon is the next 7 days. Progress counts milestones only for projects that have them. Projects with no milestones stay “No milestones,” not 0%."
      window={window}
      pathname="/dashboard/reports/projects"
    >
      {!report ? <p className="text-sm text-red-700">Unable to load the project report.</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Overdue projects" value={String(report.overdue)} />
            <Kpi label="Due in 7 days" value={String(report.due_soon)} />
            <Kpi label="Projects with milestones" value={String(report.measurable_projects)} />
            <Kpi label="No milestones" value={String(report.without_milestones)} hint="Not shown as 0% or 100%" />
            <Kpi
              label="Milestone progress"
              value={report.milestones_total === 0 ? "No milestones" : `${report.milestones_completed} / ${report.milestones_total}`}
            />
            <Kpi label="Open tasks" value={String(report.tasks.todo + report.tasks.in_progress)} />
            <Kpi label="Overdue tasks" value={String(report.tasks.overdue)} />
            <Kpi label="Overdue tasks on open projects" value={String(report.tasks.overdue_on_open_projects)} />
          </div>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Status</h2>
            <BarList rows={PROJECT_STATUSES.map((status) => ({
              label: status.replaceAll("_", " "),
              count: report.by_status[status] ?? 0,
            }))} />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Tasks</h2>
            <BarList rows={[
              { label: "To do", count: report.tasks.todo },
              { label: "In progress", count: report.tasks.in_progress },
              { label: "Done", count: report.tasks.done },
            ]} />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Open task workload</h2>
            <p className="text-xs text-zinc-500">Counts only. This is not a performance ranking.</p>
            {report.workload.length === 0 ? <p className="text-sm text-zinc-500">No open tasks.</p> : (
              <BarList rows={report.workload.map((row) => ({ label: row.label, count: row.open_tasks }))} />
            )}
          </section>
        </>
      )}
    </ReportShell>
  );
}
