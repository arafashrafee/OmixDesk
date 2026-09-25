const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ReportPreset = "30" | "90" | "year" | "all" | "custom";

export type ReportWindow = {
  preset: ReportPreset;
  start: string | null;
  end: string | null;
  label: string;
  adjusted: boolean;
};

export function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resolveReportWindow(
  input: { preset?: string; from?: string; to?: string },
  today: string,
): ReportWindow {
  const preset = input.preset;
  if (preset === "all") {
    return { preset: "all", start: null, end: null, label: "All time", adjusted: false };
  }
  if (preset === "year" && ISO_DATE.test(today)) {
    return {
      preset: "year",
      start: `${today.slice(0, 4)}-01-01`,
      end: today,
      label: "This year",
      adjusted: false,
    };
  }
  if (preset === "90") {
    return {
      preset: "90",
      start: shiftIsoDate(today, -89),
      end: today,
      label: "Last 90 days",
      adjusted: false,
    };
  }
  if (preset === "custom") {
    const start = input.from ?? "";
    const end = input.to ?? "";
    if (
      ISO_DATE.test(start) &&
      ISO_DATE.test(end) &&
      start <= end &&
      shiftIsoDate(start, 3660) >= end
    ) {
      return { preset: "custom", start, end, label: `${start} to ${end}`, adjusted: false };
    }
  }
  return {
    preset: "30",
    start: shiftIsoDate(today, -29),
    end: today,
    label: preset && preset !== "30" && preset !== "custom" ? "Last 30 days" : "Last 30 days",
    adjusted: preset === "custom",
  };
}

export function closedRate(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return "N/A";
  }
  const percent = Math.round((numerator / denominator) * 1000) / 10;
  return `${percent}%`;
}

export const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;
export const PROPOSAL_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;
