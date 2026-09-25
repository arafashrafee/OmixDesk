import { describe, expect, it } from "vitest";
import {
  can,
  canManageProjectTeam,
  canWriteClientRecords,
  canWriteProjectFiles,
  canWriteProjectScoped,
} from "@/lib/rbac";

describe("phase 2 permission matrix", () => {
  it("lets owner, admin, and project manager write clients without a project assignment", () => {
    expect(canWriteClientRecords("owner")).toBe(true);
    expect(canWriteClientRecords("admin")).toBe(true);
    expect(canWriteClientRecords("project_manager")).toBe(true);
    expect(canWriteClientRecords("member")).toBe(false);
    expect(canWriteClientRecords("client")).toBe(false);
  });

  it("limits member project writes to assigned projects", () => {
    expect(canWriteProjectScoped("member", false)).toBe(false);
    expect(canWriteProjectScoped("member", true)).toBe(true);
    expect(canWriteProjectFiles("member", false)).toBe(false);
    expect(canWriteProjectFiles("member", true)).toBe(true);
    expect(canWriteProjectScoped("project_manager", false)).toBe(true);
  });

  it("keeps client role out of staff operations and team management", () => {
    expect(can({ role: "client" }, "clients.read")).toBe(false);
    expect(can({ role: "client" }, "projects.read")).toBe(false);
    expect(can({ role: "client" }, "files.read")).toBe(false);
    expect(can({ role: "client" }, "tasks.read")).toBe(false);
    expect(canManageProjectTeam("client")).toBe(false);
    expect(canManageProjectTeam("member")).toBe(false);
    expect(canManageProjectTeam("project_manager")).toBe(true);
    expect(canManageProjectTeam("owner")).toBe(true);
  });

  it("does not let project managers administer staff membership", () => {
    expect(can({ role: "project_manager" }, "org.members.manage")).toBe(false);
    expect(can({ role: "admin" }, "org.members.manage")).toBe(true);
  });
});
