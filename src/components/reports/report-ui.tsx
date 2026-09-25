import Link from "next/link";
import type { ReportPreset, ReportWindow } from "@/lib/reports/range";

const LINKS = [
  ["/dashboard/reports", "Overview"],
  ["/dashboard/reports/crm", "CRM"],
  ["/dashboard/reports/projects", "Projects"],
  ["/dashboard/reports/sales", "Sales"],
  ["/dashboard/reports/clients", "Clients"],
] as const;

export function ReportShell({
  title,
  description,
  window,
  pathname,
  children,
}: {
  title: string;
  description: string;
  window: ReportWindow;
  pathname: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        <p className="mt-1 text-sm text-zinc-600">{description}</p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 text-sm">
        {LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={`${href}?range=${window.preset}${window.preset === "custom" && window.start && window.end ? `&from=${window.start}&to=${window.end}` : ""}`}
            aria-current={pathname === href ? "page" : undefined}
            className={pathname === href ? "rounded-lg bg-white px-3 py-2 font-medium text-[#17356b] shadow-sm" : "px-3 py-2 text-zinc-600"}
          >
            {label}
          </Link>
        ))}
      </nav>
      <ReportFilters window={window} />
      {window.adjusted ? (
        <p className="text-sm text-zinc-600">The date range was invalid, so this view uses the last 30 days.</p>
      ) : null}
      {children}
    </div>
  );
}

function ReportFilters({ window }: { window: ReportWindow }) {
  const presets: Array<[ReportPreset, string]> = [
    ["30", "Last 30 days"],
    ["90", "Last 90 days"],
    ["year", "This year"],
    ["all", "All time"],
  ];
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      {presets.map(([preset, label]) => (
        <Link
          key={preset}
          href={`?range=${preset}`}
          className={window.preset === preset ? "bg-[#17356b] px-3 py-2 text-white" : "border border-zinc-300 px-3 py-2"}
        >
          {label}
        </Link>
      ))}
      <form className="flex flex-wrap items-end gap-2" method="get">
        <input type="hidden" name="range" value="custom" />
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">From</span>
          <input className="border border-zinc-300 px-2 py-1.5" type="date" name="from" defaultValue={window.start ?? ""} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">To</span>
          <input className="border border-zinc-300 px-2 py-1.5" type="date" name="to" defaultValue={window.end ?? ""} />
        </label>
        <button className="border border-zinc-300 px-3 py-2" type="submit">Apply</button>
      </form>
    </div>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-zinc-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function BarList({
  rows,
}: {
  rows: Array<{ label: string; count: number }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (rows.every((row) => row.count === 0)) {
    return <p className="empty-state">No data in this period.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex justify-between text-sm">
            <span>{row.label}</span>
            <span className="tabular-nums">{row.count}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-zinc-100">
            <div className="h-2 rounded-full bg-[#17356b]" style={{ width: `${Math.round((row.count / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MoneyLines({
  rows,
  empty,
}: {
  rows: Array<{ currency: string; lines: Array<[string, string]> }>;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">{empty}</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.currency} className="border border-zinc-200 bg-white px-4 py-3 text-sm">
          <p className="text-xs tracking-wide text-zinc-500 uppercase">{row.currency}</p>
          <ul className="mt-2 space-y-1">
            {row.lines.map(([label, amount]) => (
              <li key={label} className="flex justify-between gap-4">
                <span>{label}</span>
                <span className="tabular-nums">{amount}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
