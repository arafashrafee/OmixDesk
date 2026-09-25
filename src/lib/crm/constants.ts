export const LEAD_SOURCES = [
  "Website",
  "Referral",
  "Upwork",
  "LinkedIn",
  "Facebook",
  "Direct",
  "Other",
] as const;

export const SERVICE_INTERESTS = [
  "Website Development",
  "WordPress / WooCommerce",
  "Custom Software",
  "ERP / CRM",
  "AI Automation",
  "UI / UX",
  "Digital Marketing",
  "Branding",
  "Other",
] as const;

export const OPEN_LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
] as const;

export const LEAD_PRIORITIES = ["low", "medium", "high"] as const;

export const USER_ACTIVITY_TYPES = [
  "note",
  "call",
  "email",
  "meeting",
  "follow_up",
] as const;

export type OpenLeadStatus = (typeof OPEN_LEAD_STATUSES)[number];
export type LeadStatus = OpenLeadStatus | "won" | "lost";
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];
export type UserActivityType = (typeof USER_ACTIVITY_TYPES)[number];

export function isOpenLeadStatus(value: string): value is OpenLeadStatus {
  return (OPEN_LEAD_STATUSES as readonly string[]).includes(value);
}
