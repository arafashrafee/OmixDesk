import { describe, expect, it } from "vitest";
import { can, isStaffRole, type OrgRole } from "@/lib/rbac";

const roles: OrgRole[] = [
  "owner",
  "admin",
  "project_manager",
  "member",
  "client",
];

describe("RBAC capability skeleton", () => {
  it("grants app access to staff only", () => {
    for (const role of roles) {
      expect(can({ role }, "app.access")).toBe(role !== "client");
      expect(can({ role }, "portal.access")).toBe(role === "client");
      expect(isStaffRole(role)).toBe(role !== "client");
    }
  });

  it("restricts staff membership management to owner and admin", () => {
    expect(can({ role: "owner" }, "org.members.manage")).toBe(true);
    expect(can({ role: "admin" }, "org.members.manage")).toBe(true);
    expect(can({ role: "project_manager" }, "org.members.manage")).toBe(false);
    expect(can({ role: "member" }, "org.members.manage")).toBe(false);
    expect(can({ role: "client" }, "org.members.manage")).toBe(false);
  });

  it("allows member project writes only when assigned", () => {
    expect(can({ role: "member" }, "projects.write")).toBe(false);
    expect(
      can({ role: "member", isProjectMember: true }, "projects.write"),
    ).toBe(true);
    expect(can({ role: "member" }, "projects.read")).toBe(true);
  });

  it("keeps owner/admin/pm org-wide project writes", () => {
    expect(can({ role: "owner" }, "projects.write")).toBe(true);
    expect(can({ role: "admin" }, "projects.write")).toBe(true);
    expect(can({ role: "project_manager" }, "projects.write")).toBe(true);
  });

  it("never grants clients CRM or task permissions", () => {
    expect(can({ role: "client" }, "leads.read")).toBe(false);
    expect(can({ role: "client" }, "tasks.read")).toBe(false);
    expect(can({ role: "client" }, "org.settings.manage")).toBe(false);
  });
});
