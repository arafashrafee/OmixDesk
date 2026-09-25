import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/rbac";
import { AppError } from "@/lib/errors";
import {
  ACTIVE_ORG_COOKIE,
  ACTIVE_ORG_COOKIE_OPTIONS,
} from "@/lib/auth/constants";
import { cookies } from "next/headers";

export type Membership = {
  organizationId: string;
  role: OrgRole;
  organizationName: string;
  timezone: string;
  defaultCurrency: string;
};

export type AuthContext = {
  userId: string;
  email: string;
  memberships: Membership[];
  activeOrganization: Membership | null;
};

function isOrgRole(value: string): value is OrgRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "project_manager" ||
    value === "member" ||
    value === "client"
  );
}

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new AppError("unauthenticated", "You must be signed in.", 401);
  }
  return user;
}

export async function listMemberships(userId: string): Promise<Membership[]> {
  const supabase = await createClient();
  const { data: memberRows, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (memberError) {
    throw new AppError(
      "membership_lookup_failed",
      "Unable to load organizations.",
      500,
    );
  }

  if (!memberRows || memberRows.length === 0) {
    return [];
  }

  const orgIds = memberRows.map((row) => row.organization_id);
  const { data: orgs, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, timezone, default_currency")
    .in("id", orgIds);

  if (orgError) {
    throw new AppError(
      "membership_lookup_failed",
      "Unable to load organizations.",
      500,
    );
  }

  const orgById = new Map((orgs ?? []).map((org) => [org.id, org]));
  const memberships: Membership[] = [];

  for (const row of memberRows) {
    if (!isOrgRole(row.role)) {
      continue;
    }
    const org = orgById.get(row.organization_id);
    if (!org) {
      continue;
    }
    memberships.push({
      organizationId: row.organization_id,
      role: row.role,
      organizationName: org.name,
      timezone: org.timezone,
      defaultCurrency: org.default_currency,
    });
  }

  return memberships;
}

export async function verifyOrgMembership(
  userId: string,
  organizationId: string,
): Promise<Membership | null> {
  const memberships = await listMemberships(userId);
  return memberships.find((m) => m.organizationId === organizationId) ?? null;
}

export async function getActiveOrganizationIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  if (!value) {
    return null;
  }
  // UUID shape only — membership is still verified separately.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return null;
  }
  return value;
}

export async function setActiveOrganizationCookie(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, ACTIVE_ORG_COOKIE_OPTIONS);
}

export async function clearActiveOrganizationCookie() {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, "", {
    ...ACTIVE_ORG_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

/**
 * Resolves auth + memberships + verified active org.
 * Never trusts a browser-supplied organization id without membership verification.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getSessionUser();
  if (!user || !user.email) {
    return null;
  }

  const memberships = await listMemberships(user.id);
  const cookieOrgId = await getActiveOrganizationIdFromCookie();

  let activeOrganization: Membership | null = null;
  if (cookieOrgId) {
    activeOrganization =
      memberships.find((m) => m.organizationId === cookieOrgId) ?? null;
  }
  if (!activeOrganization && memberships[0]) {
    activeOrganization = memberships[0];
  }

  return {
    userId: user.id,
    email: user.email,
    memberships,
    activeOrganization,
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new AppError("unauthenticated", "You must be signed in.", 401);
  }
  return ctx;
}

export async function requireActiveStaffContext(): Promise<
  AuthContext & { activeOrganization: Membership }
> {
  const ctx = await requireAuthContext();
  if (!ctx.activeOrganization) {
    throw new AppError("no_organization", "Create or join an organization.", 403);
  }
  if (ctx.activeOrganization.role === "client") {
    throw new AppError("forbidden", "You do not have access.", 403);
  }
  return ctx as AuthContext & { activeOrganization: Membership };
}
