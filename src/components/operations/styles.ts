export const fieldClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus-visible:border-[#17356b] focus-visible:ring-2 focus-visible:ring-[#17356b]/20 disabled:bg-zinc-50";

export const buttonClass =
  "rounded-lg bg-[#17356b] px-3 py-2 text-sm font-medium text-white hover:bg-[#102544] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17356b] disabled:opacity-60";

export const quietButtonClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17356b] disabled:opacity-60";

export function statusClass(value: string): string {
  const tone =
    value === "paid" || value === "accepted" || value === "won" || value === "completed" || value === "done"
      ? "bg-emerald-50 text-emerald-900"
      : value === "void" || value === "lost" || value === "cancelled" || value === "rejected"
        ? "bg-zinc-100 text-zinc-700"
        : value === "overdue" || value === "urgent"
          ? "bg-amber-50 text-amber-950"
          : "bg-sky-50 text-sky-950";
  return `inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${tone}`;
}

export function labelize(value: string): string {
  return value.replaceAll("_", " ");
}

export const destructiveButtonClass = "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60";
