import type { OrgRole } from "@/lib/rbac";
import { deriveMilestoneProgress, formatMilestoneProgress } from "@/lib/operations/progress";
import { isStaffRole } from "@/lib/rbac";

export function homeForRole(role: OrgRole | null): "/dashboard" | "/portal" | "/onboarding" {
  if (!role) {
    return "/onboarding";
  }
  return isStaffRole(role) ? "/dashboard" : "/portal";
}

export function canOpenDashboard(role: OrgRole): boolean {
  return isStaffRole(role);
}

export function canOpenPortal(role: OrgRole): boolean {
  return role === "client";
}

export const PORTAL_PROJECT_FIELDS = [
  "name",
  "description",
  "status",
  "deadline",
  "milestone_total",
  "milestone_completed",
] as const;

export const PORTAL_TASK_FIELDS = ["title", "description", "status", "due_date"] as const;

export function clientMayReadFile(input: {
  visibleToClient: boolean;
  mappedToOwner: boolean;
}): boolean {
  return input.visibleToClient && input.mappedToOwner;
}

export function clientMaySeeProposal(input: {
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  linkedToMappedClient: boolean;
}): boolean {
  return input.status !== "draft" && input.linkedToMappedClient;
}

export function clientMayRespond(status: string): boolean {
  return status === "sent";
}

export function formatPortalProgress(completed: number, total: number): string {
  return formatMilestoneProgress(
    deriveMilestoneProgress(
      Array.from({ length: total }, (_, index) =>
        index < completed ? "completed" : "pending",
      ),
    ),
  );
}
