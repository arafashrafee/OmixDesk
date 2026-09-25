import Link from "next/link";
import { getAuthContext } from "@/lib/auth/session";
import { calendarDate, monthBounds, summarizeBilling } from "@/lib/billing/rules";
import { listBillingRows } from "@/lib/data/invoices";
import { leadSummary } from "@/lib/data/leads";
import { canReadReports, isStaffRole } from "@/lib/rbac";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization) {
    redirect("/onboarding");
  }

  const org = ctx.activeOrganization;
  const [crm, billing] = await Promise.all([
    isStaffRole(org.role) ? leadSummary(org.organizationId) : Promise.resolve(null),
    isStaffRole(org.role) ? listBillingRows(org.organizationId) : Promise.resolve(null),
  ]);
  const today = calendarDate(org.timezone);
  const bounds = monthBounds(today);
  const money = billing?.ok
    ? summarizeBilling({
        invoices: billing.invoices,
        payments: billing.payments,
        today,
        monthStart: bounds.start,
        monthEnd: bounds.end,
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Workspace for {org.organizationName}.{" "}
          <Link href="/dashboard/leads" className="underline">
            Leads
          </Link>
          , clients, and projects are in the navigation.
          {canReadReports(org.role) ? (
            <>
              {" "}
              <Link href="/dashboard/reports" className="underline">Reports</Link> holds the longer CRM, project, and billing views.
            </>
          ) : null}
        </p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="border border-zinc-200 bg-white px-4 py-3">
          <dt className="text-xs tracking-wide text-zinc-500 uppercase">
            Active organization
          </dt>
          <dd className="mt-1 text-sm font-medium text-zinc-900">
            {org.organizationName}
          </dd>
        </div>
        <div className="border border-zinc-200 bg-white px-4 py-3">
          <dt className="text-xs tracking-wide text-zinc-500 uppercase">
            Your role
          </dt>
          <dd className="mt-1 text-sm font-medium text-zinc-900">{org.role}</dd>
        </div>
        <div className="border border-zinc-200 bg-white px-4 py-3">
          <dt className="text-xs tracking-wide text-zinc-500 uppercase">
            Defaults
          </dt>
          <dd className="mt-1 text-sm font-medium text-zinc-900">
            {org.timezone} · {org.defaultCurrency}
          </dd>
        </div>
        {crm ? (
          <div className="border border-zinc-200 bg-white px-4 py-3">
            <dt className="text-xs tracking-wide text-zinc-500 uppercase">
              Open leads
            </dt>
            <dd className="mt-1 text-sm font-medium text-zinc-900">{crm.open}</dd>
          </div>
        ) : null}
        {crm ? (
          <div className="border border-zinc-200 bg-white px-4 py-3">
            <dt className="text-xs tracking-wide text-zinc-500 uppercase">
              Follow-ups due
            </dt>
            <dd className="mt-1 text-sm font-medium text-zinc-900">{crm.followUpsDue}</dd>
          </div>
        ) : null}
        {money.map((bucket) => (
          <div key={bucket.currency} className="border border-zinc-200 bg-white px-4 py-3 sm:col-span-3">
            <dt className="text-xs tracking-wide text-zinc-500 uppercase">
              Billing · {bucket.currency}
            </dt>
            <dd className="mt-1 text-sm text-zinc-900">
              {bucket.outstandingCount} outstanding · {bucket.outstandingAmount.toFixed(2)} due
              {" · "}
              {bucket.overdueAmount.toFixed(2)} overdue
              {" · "}
              {bucket.paymentsThisMonth.toFixed(2)} received this month
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
