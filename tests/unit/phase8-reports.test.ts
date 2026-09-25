import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canReadReports } from "@/lib/rbac";
import { closedRate, resolveReportWindow, shiftIsoDate } from "@/lib/reports/range";
import { calendarDate } from "@/lib/billing/rules";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260925000006_phase8_analytics.sql"),
  "utf8",
);

describe("report access", () => {
  it("allows owner, admin, and project manager only", () => {
    expect(canReadReports("owner")).toBe(true);
    expect(canReadReports("admin")).toBe(true);
    expect(canReadReports("project_manager")).toBe(true);
    expect(canReadReports("member")).toBe(false);
    expect(canReadReports("client")).toBe(false);
  });
});

describe("report windows", () => {
  const today = "2026-09-25";

  it("builds the documented presets and rejects invalid custom ranges", () => {
    expect(resolveReportWindow({ preset: "30" }, today)).toMatchObject({
      start: shiftIsoDate(today, -29),
      end: today,
      adjusted: false,
    });
    expect(resolveReportWindow({ preset: "90" }, today).start).toBe(shiftIsoDate(today, -89));
    expect(resolveReportWindow({ preset: "year" }, today)).toMatchObject({ start: "2026-01-01", end: today });
    expect(resolveReportWindow({ preset: "all" }, today)).toMatchObject({ start: null, end: null });
    expect(resolveReportWindow({ preset: "custom", from: "2026-09-01", to: "2026-09-10" }, today).adjusted).toBe(false);
    expect(resolveReportWindow({ preset: "custom", from: "2026-10-01", to: "2026-09-01" }, today).preset).toBe("30");
    expect(resolveReportWindow({ preset: "custom", from: "nope", to: "2026-09-01" }, today).adjusted).toBe(true);
    expect(resolveReportWindow({ preset: "unknown" }, today).preset).toBe("30");
  });

  it("uses the organization calendar date for an overdue boundary", () => {
    const local = calendarDate("Asia/Dhaka", new Date("2026-09-24T20:00:00Z"));
    expect(local).toBe("2026-09-25");
    expect(calendarDate("Not/AZone", new Date("2026-09-24T20:00:00Z"))).toBe("2026-09-24");
  });
});

describe("report rates", () => {
  it("returns N/A when the denominator is empty", () => {
    expect(closedRate(0, 0)).toBe("N/A");
    expect(closedRate(1, 2)).toBe("50%");
    expect(closedRate(1, 0)).toBe("N/A");
  });
});

describe("phase 8 report sql", () => {
  it("checks the reader before aggregates and keeps currencies apart", () => {
    const overview = sql.slice(sql.indexOf("function public.report_overview"), sql.indexOf("function public.report_crm"));
    expect(overview.indexOf("assert_report_reader")).toBeLessThan(overview.indexOf("from public.leads"));
    expect(sql).toContain("has_org_role");
    expect(sql).toContain("'project_manager'::public.org_role");
    expect(sql).not.toContain("'member'::public.org_role");
    expect(sql).toContain("group by proposal.currency");
    expect(sql).toContain("group by invoice.currency");
    expect(sql).toContain("due_date < v_today");
    expect(sql).not.toContain("'void'");
    expect(sql).toContain("partially_paid");
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/run_report|execute\s+format|execute\s+\$/i);
    expect(sql).toContain("won'::public.lead_status, 'lost'::public.lead_status");
    expect(sql).toContain("completed'::public.project_status, 'cancelled'::public.project_status");
    expect(sql).toContain("v_today + 7");
    expect(sql).toContain("grant execute on function public.report_overview");
    expect(sql).toContain("revoke all on function public.assert_report_reader(uuid) from public, anon, authenticated");
    expect(sql).not.toContain("estimated_value");
  });
});
