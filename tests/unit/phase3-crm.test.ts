import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { followUpState } from "@/lib/crm/follow-up";
import { conversionDecision, canChangeLeadStatus, memberMaySetAssignee } from "@/lib/crm/transitions";
import { firstAffected } from "@/lib/operations/mutation";
import {
  canConvertLead,
  canCreateLead,
  canManageLeads,
  canUpdateLead,
  can,
} from "@/lib/rbac";
import { leadActivitySchema, leadFormSchema } from "@/lib/validations/leads";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "33333333-3333-4333-8333-333333333333";
const USER_B = "44444444-4444-4444-8444-444444444444";
const CLIENT_ID = "55555555-5555-4555-8555-555555555555";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260925000001_phase3_crm.sql"),
  "utf8",
);

describe("CRM permission matrix", () => {
  it("gives the client role no CRM access", () => {
    expect(can({ role: "client" }, "leads.read")).toBe(false);
    expect(canCreateLead("client")).toBe(false);
    expect(canUpdateLead("client", true)).toBe(false);
    expect(canConvertLead("client")).toBe(false);
    expect(canManageLeads("client")).toBe(false);
  });

  it("lets members create leads and update only when assigned", () => {
    expect(canCreateLead("member")).toBe(true);
    expect(canUpdateLead("member", false)).toBe(false);
    expect(canUpdateLead("member", true)).toBe(true);
    expect(canConvertLead("member")).toBe(false);
    expect(canManageLeads("member")).toBe(false);
    expect(canConvertLead("project_manager")).toBe(true);
    expect(canManageLeads("admin")).toBe(true);
  });

  it("stops a member assigning a lead to someone else", () => {
    expect(
      memberMaySetAssignee({
        isManager: false,
        actorId: USER_A,
        currentAssignee: null,
        nextAssignee: USER_B,
      }),
    ).toBe(false);
    expect(
      memberMaySetAssignee({
        isManager: false,
        actorId: USER_A,
        currentAssignee: USER_A,
        nextAssignee: USER_A,
      }),
    ).toBe(true);
    expect(
      memberMaySetAssignee({
        isManager: true,
        actorId: USER_A,
        currentAssignee: USER_A,
        nextAssignee: USER_B,
      }),
    ).toBe(true);
  });
});

describe("lead status rules", () => {
  it("refuses a direct won status and leaving won", () => {
    expect(
      canChangeLeadStatus({
        role: "admin",
        isAssignee: false,
        from: "proposal",
        to: "won",
      }),
    ).toBe(false);
    expect(
      canChangeLeadStatus({
        role: "owner",
        isAssignee: false,
        from: "won",
        to: "proposal",
      }),
    ).toBe(false);
  });

  it("lets managers mark lost and reopen, and keeps members on open stages", () => {
    expect(
      canChangeLeadStatus({
        role: "project_manager",
        isAssignee: false,
        from: "proposal",
        to: "lost",
      }),
    ).toBe(true);
    expect(
      canChangeLeadStatus({
        role: "member",
        isAssignee: true,
        from: "qualified",
        to: "lost",
      }),
    ).toBe(false);
    expect(
      canChangeLeadStatus({
        role: "admin",
        isAssignee: false,
        from: "lost",
        to: "contacted",
      }),
    ).toBe(true);
    expect(
      canChangeLeadStatus({
        role: "member",
        isAssignee: true,
        from: "lost",
        to: "contacted",
      }),
    ).toBe(false);
    expect(
      canChangeLeadStatus({
        role: "member",
        isAssignee: true,
        from: "new",
        to: "contacted",
      }),
    ).toBe(true);
    expect(
      canChangeLeadStatus({
        role: "member",
        isAssignee: false,
        from: "new",
        to: "contacted",
      }),
    ).toBe(false);
  });
});

describe("lead conversion decision", () => {
  it("denies cross-tenant conversion and members", () => {
    expect(
      conversionDecision({
        canManage: true,
        leadOrganizationId: ORG_B,
        activeOrganizationId: ORG_A,
        convertedClientId: null,
      }),
    ).toBe("deny");
    expect(
      conversionDecision({
        canManage: false,
        leadOrganizationId: ORG_A,
        activeOrganizationId: ORG_A,
        convertedClientId: null,
      }),
    ).toBe("deny");
  });

  it("creates once and returns the existing client on a second conversion", () => {
    expect(
      conversionDecision({
        canManage: true,
        leadOrganizationId: ORG_A,
        activeOrganizationId: ORG_A,
        convertedClientId: null,
      }),
    ).toBe("create");
    expect(
      conversionDecision({
        canManage: true,
        leadOrganizationId: ORG_A,
        activeOrganizationId: ORG_A,
        convertedClientId: CLIENT_ID,
      }),
    ).toBe("already");
  });
});

describe("lead validation and follow-up", () => {
  it("rejects won, a bad email, and a negative value on the standard form", () => {
    expect(
      leadFormSchema.safeParse({
        name: "Ada",
        company: "",
        email: "not-an-email",
        phone: "",
        source: "",
        serviceInterest: "",
        estimatedValue: "-1",
        status: "won",
        priority: "high",
        assignedTo: "",
        nextFollowUp: "",
        notes: "",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown activity type", () => {
    expect(
      leadActivitySchema.safeParse({
        leadId: CLIENT_ID,
        activityType: "status_change",
        content: "Forged",
      }).success,
    ).toBe(false);
    expect(
      leadActivitySchema.safeParse({
        leadId: CLIENT_ID,
        activityType: "note",
        content: "Spoke with the buyer.",
      }).success,
    ).toBe(true);
  });

  it("marks past follow-ups overdue and ignores an empty value", () => {
    expect(followUpState(null, new Date("2026-09-25T00:00:00Z"))).toBe("none");
    expect(
      followUpState("2026-09-24T00:00:00.000Z", new Date("2026-09-25T00:00:00Z")),
    ).toBe("overdue");
    expect(
      followUpState("2026-09-26T00:00:00.000Z", new Date("2026-09-25T00:00:00Z")),
    ).toBe("upcoming");
  });

  it("does not treat an empty write as success", () => {
    expect(firstAffected([])).toBeNull();
  });
});

describe("phase 3 migration security contract", () => {
  it("forces RLS, keeps conversion atomic, and blocks a direct won update", () => {
    expect(sql).toContain("alter table public.leads force row level security");
    expect(sql).toContain("alter table public.lead_activities force row level security");
    expect(sql).toContain("revoke all on table public.leads from public, anon");
    expect(sql).toContain("constraint leads_client_same_org");
    expect(sql).toContain("constraint lead_activities_lead_same_org");
    expect(sql).toContain("function public.convert_lead_to_client");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("omixdesk.converting_lead");
    expect(sql).toContain("for update");
    expect(sql).toContain("and organization_id = p_organization_id");
    expect(sql).not.toContain("grant select, insert, update, delete on table public.leads to authenticated");
    expect(sql).toContain("converted_client_id");
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toContain("create table public.projects");
  });
});
