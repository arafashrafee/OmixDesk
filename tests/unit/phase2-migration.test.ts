import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260925000000_phase2_operations.sql",
  ),
  "utf8",
);

describe("phase 2 migration security contract", () => {
  it("forces RLS and removes anon access on operational tables", () => {
    for (const table of [
      "clients",
      "projects",
      "project_members",
      "milestones",
      "tasks",
      "files",
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon`);
    }
  });

  it("keeps composite foreign keys so parents cannot cross organizations", () => {
    expect(sql).toContain("constraint projects_client_same_org");
    expect(sql).toContain("references public.clients (organization_id, id)");
    expect(sql).toContain("constraint tasks_milestone_same_project");
    expect(sql).toContain("constraint tasks_assignee_same_org");
    expect(sql).toContain("constraint files_project_same_org");
    expect(sql).toContain("constraint files_client_same_org");
    expect(sql).toContain("constraint files_one_owner");
  });

  it("keeps the storage bucket private and path-checked", () => {
    expect(sql).toContain("'omixdesk-files'");
    expect(sql).toContain("public = false");
    expect(sql).toContain("can_read_omixdesk_object");
    expect(sql).toContain("can_write_omixdesk_object");
    expect(sql).not.toMatch(/service_role/i);
  });

  it("does not add a manually edited project progress column", () => {
    expect(sql).not.toContain("progress_percent");
  });
});
