import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PORTAL_PROJECT_FIELDS,
  PORTAL_TASK_FIELDS,
  canOpenDashboard,
  canOpenPortal,
  clientMayReadFile,
  clientMayRespond,
  clientMaySeeProposal,
  homeForRole,
} from "@/lib/portal/access";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260925000003_phase5_client_portal.sql"),
  "utf8",
);

describe("portal routing", () => {
  it("sends staff to the dashboard and clients to the portal", () => {
    expect(homeForRole("owner")).toBe("/dashboard");
    expect(homeForRole("member")).toBe("/dashboard");
    expect(homeForRole("client")).toBe("/portal");
    expect(homeForRole(null)).toBe("/onboarding");
    expect(canOpenDashboard("client")).toBe(false);
    expect(canOpenPortal("client")).toBe(true);
    expect(canOpenPortal("admin")).toBe(false);
  });
});

describe("portal visibility rules", () => {
  it("keeps budget and assignee fields out of the client project and task models", () => {
    expect(PORTAL_PROJECT_FIELDS).not.toContain("budget");
    expect(PORTAL_TASK_FIELDS).not.toContain("assigned_to");
    expect(PORTAL_TASK_FIELDS).not.toContain("created_by");
  });

  it("hides draft proposals, internal tasks, and staff-only files", () => {
    expect(clientMaySeeProposal({ status: "draft", linkedToMappedClient: true })).toBe(false);
    expect(clientMaySeeProposal({ status: "sent", linkedToMappedClient: true })).toBe(true);
    expect(clientMaySeeProposal({ status: "accepted", linkedToMappedClient: false })).toBe(false);
    expect(clientMayReadFile({ visibleToClient: false, mappedToOwner: true })).toBe(false);
    expect(clientMayReadFile({ visibleToClient: true, mappedToOwner: false })).toBe(false);
    expect(clientMayReadFile({ visibleToClient: true, mappedToOwner: true })).toBe(true);
    expect(clientMayRespond("sent")).toBe(true);
    expect(clientMayRespond("accepted")).toBe(false);
  });
});

describe("phase 5 migration security contract", () => {
  it("maps portal users, hides direct table reads, and locks invitation acceptance", () => {
    expect(sql).toContain("create table public.client_users");
    expect(sql).toContain("constraint client_users_client_same_org");
    expect(sql).toContain("constraint client_users_member_same_org");
    expect(sql).toContain("v_role is distinct from 'client'");
    expect(sql).toContain("visible_to_client boolean not null default false");
    expect(sql).toContain("function public.client_respond_to_proposal");
    expect(sql).toContain("for update");
    expect(sql).toContain("status = 'sent'");
    expect(sql).not.toContain("internal_notes");
    expect(sql).toContain("function public.revoke_client_portal_access");
    expect(sql).toContain("insert into public.organization_members");
    expect(sql).toContain("insert into public.client_users");
    expect(sql).toContain("grant select on table public.client_users to authenticated");
    expect(sql).not.toContain("grant select, insert, delete on table public.client_users");
    expect(sql).toContain("revoke all on function public.enforce_client_user_role() from public, anon, authenticated");
    expect(sql).not.toContain("grant execute on function public.enforce_client_user_role()");
    expect(sql).toContain("file.visible_to_client = true");
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toContain("grant select on table public.projects");
  });
});
