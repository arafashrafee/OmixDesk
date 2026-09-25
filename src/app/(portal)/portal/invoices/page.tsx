import Link from "next/link";
import { redirect } from "next/navigation";
import { calendarDate, displayInvoiceStatus, summarizeBilling, monthBounds, type InvoiceStatus } from "@/lib/billing/rules";
import { getAuthContext } from "@/lib/auth/session";
import { loadPortalInvoices } from "@/lib/data/portal";

export default async function PortalInvoicesPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role !== "client") {
    redirect("/portal");
  }
  const organizationId = ctx.activeOrganization.organizationId;
  const invoices = await loadPortalInvoices(organizationId);
  const today = calendarDate(ctx.activeOrganization.timezone);
  const bounds = monthBounds(today);
  const totals = summarizeBilling({
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      currency: invoice.currency,
      status: invoice.status,
      dueDate: invoice.due_date,
      balanceDue: Number(invoice.balance_due),
    })),
    payments: [],
    today,
    monthStart: bounds.start,
    monthEnd: bounds.end,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Invoices</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Outstanding balances are collected by the organization. Online payment is not available.
        </p>
      </div>
      {totals.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {totals.map((bucket) => (
            <li key={bucket.currency} className="border border-zinc-200 bg-white px-4 py-3 text-sm">
              <p className="text-xs tracking-wide text-zinc-500 uppercase">{bucket.currency}</p>
              <p className="mt-1 font-medium text-zinc-900">
                {bucket.outstandingCount} outstanding · {bucket.outstandingAmount.toFixed(2)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">No outstanding balance.</p>
      )}
      {invoices.length === 0 ? (
        <p className="text-sm text-zinc-500">No invoices yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <Link href={`/portal/invoices/${invoice.id}`} className="font-medium text-zinc-900">
                {invoice.invoice_number} · {invoice.title}
              </Link>
              <span className="text-zinc-600">
                {displayInvoiceStatus({
                  status: invoice.status as InvoiceStatus,
                  dueDate: invoice.due_date,
                  balanceDue: Number(invoice.balance_due),
                  today,
                })}
                {invoice.status === "void" ? "" : ` · ${invoice.currency} ${Number(invoice.balance_due).toFixed(2)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
