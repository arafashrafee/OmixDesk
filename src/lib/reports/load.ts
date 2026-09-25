import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const moneyRow = z.object({
  currency: z.string(),
  amount: z.string(),
});

const overviewSchema = z.object({
  today: z.string(),
  timezone: z.string(),
  period_leads_created: z.number(),
  current_open_leads: z.number(),
  followups_overdue: z.number(),
  active_projects: z.number(),
  projects_due_soon: z.number(),
  accepted_proposals: z.array(moneyRow),
  billing_now: z.array(z.object({
    currency: z.string(),
    outstanding: z.string(),
    overdue: z.string(),
    collected_this_month: z.string(),
  })),
});

const crmSchema = z.object({
  pipeline: z.record(z.string(), z.number()),
  sources: z.array(z.object({ source: z.string(), count: z.number(), won: z.number() })),
  lost_reasons: z.array(z.object({ reason: z.string(), count: z.number() })),
  followups: z.object({ due_today: z.number(), overdue: z.number(), upcoming: z.number() }),
});

const projectsSchema = z.object({
  by_status: z.record(z.string(), z.number()),
  overdue: z.number(),
  due_soon: z.number(),
  without_milestones: z.number(),
  milestones_completed: z.number(),
  milestones_total: z.number(),
  measurable_projects: z.number(),
  tasks: z.object({
    todo: z.number(),
    in_progress: z.number(),
    done: z.number(),
    overdue: z.number(),
    overdue_on_open_projects: z.number(),
  }),
  workload: z.array(z.object({ label: z.string(), open_tasks: z.number() })),
});

const salesSchema = z.object({
  grain: z.enum(["day", "week", "month"]),
  proposal_counts: z.record(z.string(), z.number()),
  proposal_money: z.array(z.object({
    currency: z.string(),
    open: z.string(),
    accepted: z.string(),
    rejected: z.string(),
  })),
  billing: z.array(z.object({
    currency: z.string(),
    invoiced: z.string(),
    collected: z.string(),
    outstanding_now: z.string(),
    overdue_now: z.string(),
  })),
  invoice_counts: z.object({
    issued_in_period: z.number(),
    paid_now: z.number(),
    partial_now: z.number(),
    outstanding_now: z.number(),
  }),
  payment_trend: z.array(z.object({ currency: z.string(), bucket: z.string(), amount: z.string() })),
  invoice_trend: z.array(z.object({ currency: z.string(), bucket: z.string(), amount: z.string() })),
});

const clientMoney = z.object({
  currency: z.string(),
  accepted_proposals: z.string(),
  invoiced: z.string(),
  collected: z.string(),
  outstanding: z.string(),
});

const clientsSchema = z.object({
  total: z.number(),
  rows: z.array(z.object({
    id: z.string(),
    name: z.string(),
    projects: z.number(),
    active_projects: z.number(),
    money: z.array(clientMoney),
  })),
});

const clientSchema = z.object({
  active_projects: z.number(),
  money: z.array(clientMoney),
});

async function callReport<T>(
  name: "report_overview" | "report_crm" | "report_projects" | "report_sales" | "report_clients" | "report_client",
  args: Record<string, string | number | null>,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args as never);
  const parsed = schema.safeParse(data);
  if (error || !parsed.success) {
    return null;
  }
  return parsed.data;
}

export function loadOverview(organizationId: string, start: string | null, end: string | null) {
  return callReport("report_overview", {
    p_organization_id: organizationId,
    p_start: start,
    p_end: end,
  }, overviewSchema);
}

export function loadCrm(organizationId: string, start: string | null, end: string | null) {
  return callReport("report_crm", {
    p_organization_id: organizationId,
    p_start: start,
    p_end: end,
  }, crmSchema);
}

export function loadProjects(organizationId: string) {
  return callReport("report_projects", { p_organization_id: organizationId }, projectsSchema);
}

export function loadSales(organizationId: string, start: string | null, end: string | null) {
  return callReport("report_sales", {
    p_organization_id: organizationId,
    p_start: start,
    p_end: end,
  }, salesSchema);
}

export function loadClients(organizationId: string, page: number) {
  return callReport("report_clients", {
    p_organization_id: organizationId,
    p_limit: 25,
    p_offset: page * 25,
  }, clientsSchema);
}

export function loadClientReport(organizationId: string, clientId: string) {
  return callReport("report_client", {
    p_organization_id: organizationId,
    p_client_id: clientId,
  }, clientSchema);
}

export type OverviewReport = z.infer<typeof overviewSchema>;
export type CrmReport = z.infer<typeof crmSchema>;
export type ProjectReport = z.infer<typeof projectsSchema>;
export type SalesReport = z.infer<typeof salesSchema>;
export type ClientsReport = z.infer<typeof clientsSchema>;
export type ClientReport = z.infer<typeof clientSchema>;
