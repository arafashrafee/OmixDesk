import { describe, expect, it } from "vitest";
import { deriveMilestoneProgress, formatMilestoneProgress } from "@/lib/operations/progress";
import { firstAffected } from "@/lib/operations/mutation";
import {
  assertActiveOrgMatch,
  buildStoragePath,
  fileOwnerIsExclusive,
  isAllowedMimeType,
  sanitizeFileName,
} from "@/lib/storage/paths";
import { clientFormSchema, projectFormSchema, taskFormSchema } from "@/lib/validations/operations";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const OBJECT_ID = "44444444-4444-4444-8444-444444444444";

describe("milestone progress", () => {
  it("returns null percent when there are no milestones", () => {
    const progress = deriveMilestoneProgress([]);
    expect(progress).toEqual({ completed: 0, total: 0, percent: null });
    expect(formatMilestoneProgress(progress)).toBe("No milestones");
  });

  it("derives percent only from completed milestones", () => {
    expect(
      deriveMilestoneProgress(["completed", "pending", "pending", "completed"]),
    ).toEqual({ completed: 2, total: 4, percent: 50 });
  });
});

describe("zero-row mutations", () => {
  it("treats an empty update result as no access", () => {
    expect(firstAffected([])).toBeNull();
    expect(firstAffected(null)).toBeNull();
    expect(firstAffected([{ id: "row" }])?.id).toBe("row");
  });
});

describe("storage paths", () => {
  it("builds a tenant-scoped project path and strips traversal from the name", () => {
    const path = buildStoragePath({
      organizationId: ORG_A,
      objectId: OBJECT_ID,
      fileName: "../../secret.pdf",
      owner: { kind: "projects", projectId: PROJECT_A },
    });
    expect(path).toBe(`${ORG_A}/projects/${PROJECT_A}/${OBJECT_ID}-secret.pdf`);
    expect(path.startsWith(`${ORG_A}/`)).toBe(true);
    expect(path.includes("..")).toBe(false);
  });

  it("rejects a foreign organization id and a mixed file owner", () => {
    expect(assertActiveOrgMatch(ORG_B, ORG_A)).toBe(false);
    expect(assertActiveOrgMatch(ORG_A, ORG_A)).toBe(true);
    expect(fileOwnerIsExclusive(PROJECT_A, null)).toBe(true);
    expect(fileOwnerIsExclusive(PROJECT_A, ORG_B)).toBe(false);
    expect(fileOwnerIsExclusive(null, null)).toBe(false);
    expect(() =>
      buildStoragePath({
        organizationId: "not-an-org",
        objectId: OBJECT_ID,
        fileName: "a.pdf",
        owner: { kind: "clients", clientId: PROJECT_A },
      }),
    ).toThrow(/Invalid storage path/);
  });

  it("sanitizes names and checks the allowlist", () => {
    expect(sanitizeFileName("my report (final).pdf")).toBe("my_report_final_.pdf");
    expect(isAllowedMimeType("application/pdf")).toBe(true);
    expect(isAllowedMimeType("application/x-msdownload")).toBe(false);
  });
});

describe("operations validation", () => {
  it("rejects unsafe client and project input", () => {
    expect(clientFormSchema.safeParse({ name: "  ", email: "nope" }).success).toBe(false);
    expect(
      projectFormSchema.safeParse({
        clientId: "org-b-client",
        name: "Site",
        description: "",
        status: "active",
        startDate: "",
        deadline: "2026-13-01",
        budget: "-5",
      }).success,
    ).toBe(false);
  });

  it("accepts an unassigned task and rejects a malformed assignee", () => {
    expect(
      taskFormSchema.safeParse({
        projectId: PROJECT_A,
        title: "Draft scope",
        description: "",
        status: "todo",
        priority: "high",
        assignedTo: "",
        dueDate: "",
        milestoneId: "",
      }).success,
    ).toBe(true);
    expect(
      taskFormSchema.safeParse({
        projectId: PROJECT_A,
        title: "Draft scope",
        description: "",
        status: "todo",
        priority: "high",
        assignedTo: ORG_B,
        dueDate: "",
        milestoneId: "not-a-milestone",
      }).success,
    ).toBe(false);
  });
});
