import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/auth/safe-redirect";

describe("safeInternalPath", () => {
  it("accepts normal internal paths", () => {
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/settings/organization")).toBe(
      "/settings/organization",
    );
    expect(safeInternalPath("/onboarding?invite=abc")).toBe(
      "/onboarding?invite=abc",
    );
  });

  it("rejects absolute external URLs", () => {
    expect(safeInternalPath("https://evil.example/phish")).toBe("/dashboard");
    expect(safeInternalPath("http://evil.example")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeInternalPath("//evil.example")).toBe("/dashboard");
    expect(safeInternalPath("/\\evil.example")).toBe("/dashboard");
    expect(safeInternalPath("/%2F%2Fevil.example")).toBe("/dashboard");
  });

  it("rejects schemed payloads and userinfo tricks", () => {
    expect(safeInternalPath("/login@evil.example")).toBe("/dashboard");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("rejects missing or empty values with fallback", () => {
    expect(safeInternalPath(null, "/onboarding")).toBe("/onboarding");
    expect(safeInternalPath("", "/onboarding")).toBe("/onboarding");
    expect(safeInternalPath("   ")).toBe("/dashboard");
  });
});
