export const ACTIVE_ORG_COOKIE = "omix_active_org_id";

export const ACTIVE_ORG_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};
