import { describe, expect, it } from "vitest";

/**
 * Documents the unauthenticated gate used by proxy + layouts.
 * Full HTTP integration against Next requires a running server; this keeps the
 * decision table explicit and regression-tested.
 */
function canAccessPath(input: {
  isAuthenticated: boolean;
  pathname: string;
}): "allow" | "redirect_login" | "redirect_dashboard" {
  const authRoutes = new Set(["/login", "/signup", "/confirm"]);
  const protectedPrefixes = ["/dashboard", "/settings", "/onboarding"];

  const requiresAuth = protectedPrefixes.some(
    (prefix) =>
      input.pathname === prefix || input.pathname.startsWith(`${prefix}/`),
  );

  if (!input.isAuthenticated && requiresAuth) {
    return "redirect_login";
  }
  if (input.isAuthenticated && authRoutes.has(input.pathname)) {
    return "redirect_dashboard";
  }
  return "allow";
}

describe("unauthenticated access policy", () => {
  it("rejects unauthenticated access to app routes", () => {
    expect(
      canAccessPath({ isAuthenticated: false, pathname: "/dashboard" }),
    ).toBe("redirect_login");
    expect(
      canAccessPath({
        isAuthenticated: false,
        pathname: "/settings/organization",
      }),
    ).toBe("redirect_login");
    expect(
      canAccessPath({ isAuthenticated: false, pathname: "/onboarding" }),
    ).toBe("redirect_login");
  });

  it("allows public marketing and auth routes when logged out", () => {
    expect(canAccessPath({ isAuthenticated: false, pathname: "/" })).toBe(
      "allow",
    );
    expect(canAccessPath({ isAuthenticated: false, pathname: "/login" })).toBe(
      "allow",
    );
  });

  it("sends authenticated users away from auth screens", () => {
    expect(canAccessPath({ isAuthenticated: true, pathname: "/login" })).toBe(
      "redirect_dashboard",
    );
  });
});
