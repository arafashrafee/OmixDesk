import { describe, expect, it } from "vitest";
import { switchOrganizationSchema } from "@/lib/validations/auth";

/**
 * Mirrors the server-side membership gate used by switchOrganizationAction:
 * browser-supplied organization IDs are schema-validated, then membership
 * must be verified before the active-org cookie is written.
 */
function resolveActiveOrgSwitch(input: {
  requestedOrganizationId: unknown;
  membershipOrgIds: string[];
}): { ok: true; organizationId: string } | { ok: false; reason: string } {
  const parsed = switchOrganizationSchema.safeParse({
    organizationId: input.requestedOrganizationId,
  });
  if (!parsed.success) {
    return { ok: false, reason: "invalid_id" };
  }
  if (!input.membershipOrgIds.includes(parsed.data.organizationId)) {
    return { ok: false, reason: "not_a_member" };
  }
  return { ok: true, organizationId: parsed.data.organizationId };
}

describe("active organization switching", () => {
  const orgA = "11111111-1111-4111-8111-111111111111";
  const orgB = "22222222-2222-4222-8222-222222222222";
  const orgC = "33333333-3333-4333-8333-333333333333";

  it("accepts a switch to an organization the user belongs to", () => {
    expect(
      resolveActiveOrgSwitch({
        requestedOrganizationId: orgB,
        membershipOrgIds: [orgA, orgB],
      }),
    ).toEqual({ ok: true, organizationId: orgB });
  });

  it("rejects switching to an organization the user does not belong to", () => {
    expect(
      resolveActiveOrgSwitch({
        requestedOrganizationId: orgC,
        membershipOrgIds: [orgA, orgB],
      }),
    ).toEqual({ ok: false, reason: "not_a_member" });
  });

  it("rejects malformed organization ids", () => {
    expect(
      resolveActiveOrgSwitch({
        requestedOrganizationId: "not-a-uuid",
        membershipOrgIds: [orgA],
      }),
    ).toEqual({ ok: false, reason: "invalid_id" });
  });

  it("rejects cross-tenant spoofing attempts from Org A into Org B", () => {
    // User is only a member of Org A; requesting Org B must fail.
    expect(
      resolveActiveOrgSwitch({
        requestedOrganizationId: orgB,
        membershipOrgIds: [orgA],
      }),
    ).toEqual({ ok: false, reason: "not_a_member" });
  });
});
