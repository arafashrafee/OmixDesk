export type FollowUpState = "none" | "upcoming" | "overdue";

export function followUpState(
  value: string | null,
  now: Date,
): FollowUpState {
  if (!value) {
    return "none";
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    return "none";
  }
  return at.getTime() < now.getTime() ? "overdue" : "upcoming";
}

export function formatFollowUpUtc(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    return value;
  }
  const formatted = at.toLocaleString("en-GB", {
    timeZone: "UTC",
    hour12: false,
  });
  return `${formatted} UTC`;
}

/** datetime-local values are stored as UTC. The field is labeled accordingly. */
export function followUpLocalToUtc(value: string | null): string | null {
  if (!value) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  return new Date(`${value}:00.000Z`).toISOString();
}

export function followUpUtcToLocal(value: string | null): string {
  if (!value) {
    return "";
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    return "";
  }
  return at.toISOString().slice(0, 16);
}
