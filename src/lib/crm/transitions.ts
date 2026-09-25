import type { OrgRole } from "@/lib/rbac";
import { canManageLeads } from "@/lib/rbac";
import {
  isOpenLeadStatus,
  type LeadStatus,
  type OpenLeadStatus,
} from "@/lib/crm/constants";

/**
 * Standard edits cannot set won. Conversion is the only path to won,
 * and a converted lead stays won.
 * Lost can be set or reopened only by owner, admin, or project manager.
 * Members may move an assigned open lead among the open stages only.
 */
export function canChangeLeadStatus(input: {
  role: OrgRole;
  isAssignee: boolean;
  from: LeadStatus;
  to: LeadStatus;
}): boolean {
  if (input.to === "won" || input.from === "won") {
    return false;
  }

  if (input.role === "client") {
    return false;
  }

  const manager = canManageLeads(input.role);

  if (input.from === "lost" || input.to === "lost") {
    return manager;
  }

  if (!isOpenLeadStatus(input.to) || !isOpenLeadStatus(input.from)) {
    return false;
  }

  if (manager) {
    return true;
  }

  return input.role === "member" && input.isAssignee;
}

export function memberMaySetAssignee(input: {
  isManager: boolean;
  actorId: string;
  currentAssignee: string | null;
  nextAssignee: string | null;
}): boolean {
  if (input.isManager) {
    return true;
  }
  if (input.nextAssignee === null) {
    return input.currentAssignee === null;
  }
  return (
    input.nextAssignee === input.actorId &&
    (input.currentAssignee === null || input.currentAssignee === input.actorId)
  );
}

export type ConversionDecision = "deny" | "already" | "create";

export function conversionDecision(input: {
  canManage: boolean;
  leadOrganizationId: string;
  activeOrganizationId: string;
  convertedClientId: string | null;
}): ConversionDecision {
  if (!input.canManage) {
    return "deny";
  }
  if (input.leadOrganizationId !== input.activeOrganizationId) {
    return "deny";
  }
  if (input.convertedClientId) {
    return "already";
  }
  return "create";
}

export function openStatusOrNull(value: string): OpenLeadStatus | null {
  return isOpenLeadStatus(value) ? value : null;
}
