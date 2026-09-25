const PATH_PATTERN = /^\/(dashboard|portal)(\/[a-z0-9][a-z0-9-]*){1,4}$/;

export function isNotificationHref(candidate: string, audience: "staff" | "client"): boolean {
  if (!PATH_PATTERN.test(candidate)) {
    return false;
  }
  if (audience === "staff") {
    return candidate.startsWith("/dashboard/");
  }
  return candidate.startsWith("/portal/");
}
