import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeFromAddress, safeRecipientEmail } from "@/lib/email/address";
import { readEmailConfig, sendTransactionalEmail, transactionalMessage } from "@/lib/email/send";
import { isNotificationHref } from "@/lib/notifications/href";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260925000005_phase7_notifications.sql"),
  "utf8",
);

describe("notification hrefs", () => {
  it("keeps client and staff destinations in their own prefixes", () => {
    expect(isNotificationHref("/portal/invoices/11111111-1111-4111-8111-111111111111", "client")).toBe(true);
    expect(isNotificationHref("/dashboard/proposals/11111111-1111-4111-8111-111111111111", "staff")).toBe(true);
    expect(isNotificationHref("/dashboard/invoices/abc", "client")).toBe(false);
    expect(isNotificationHref("/portal/invoices/abc", "staff")).toBe(false);
    for (const href of ["//evil.com", "/\\evil.com", "/portal/../dashboard", "https://evil.com", "javascript:alert(1)"]) {
      expect(isNotificationHref(href, "client")).toBe(false);
      expect(isNotificationHref(href, "staff")).toBe(false);
    }
  });
});

describe("email safety", () => {
  it("rejects header injection and missing provider config", async () => {
    expect(safeRecipientEmail("ada@example.com")).toBe("ada@example.com");
    expect(safeRecipientEmail("ada@example.com\r\nBcc: x@y.z")).toBeNull();
    expect(safeRecipientEmail("ada@example.com\n")).toBeNull();
    expect(safeFromAddress("Omix <billing@example.com>")).toBe("Omix <billing@example.com>");
    expect(safeFromAddress("bad\r\nFrom: x")).toBeNull();
    expect(readEmailConfig({})).toBeNull();
    const sent = await sendTransactionalEmail(
      { to: "ada@example.com", subject: "Hello", text: "Hi", html: "<p>Hi</p>" },
      {},
      fetch,
    );
    expect(sent).toEqual({ configured: false });
  });

  it("does not put provider failures or internal notes into the message builder", () => {
    const message = transactionalMessage({
      organizationName: "Omix",
      subject: "Invoice available",
      summary: "OMX-INV-2026-0001 · BDT 100.00 · due 2026-10-01",
      actionPath: "/portal/invoices/11111111-1111-4111-8111-111111111111",
    });
    expect(message?.text).toContain("BDT 100.00");
    expect(message?.text).not.toContain("internal");
    expect(message?.html).not.toContain("recorded_by");
    expect(transactionalMessage({
      organizationName: "Omix",
      subject: "Nope",
      summary: "x",
      actionPath: "//evil.com",
    })).toBeNull();
  });

  it("sanitizes a provider failure without keeping the response body", async () => {
    const result = await sendTransactionalEmail(
      { to: "ada@example.com", subject: "Hello", text: "Hi", html: "<p>Hi</p>" },
      { RESEND_API_KEY: "secret-key", EMAIL_FROM: "billing@example.com" },
      async () => new Response("Bearer secret-key failure", { status: 422 }),
    );
    expect(result).toEqual({ configured: true, ok: false, errorCode: "provider_rejected" });
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });
});

describe("phase 7 migration contract", () => {
  it("keeps notifications user-scoped and delivery logs manager-scoped", () => {
    expect(sql).toContain("alter table public.notifications force row level security");
    expect(sql).toContain("alter table public.email_deliveries force row level security");
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql).toContain("revoke all on table public.notifications from public, anon, authenticated");
    expect(sql).toContain("grant select on table public.notifications to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete) on table public\.notifications/i);
    expect(sql).not.toMatch(/grant (insert|update|delete) on table public\.email_deliveries/i);
    expect(sql).toContain("on conflict (organization_id, user_id, event_key) do nothing");
    expect(sql).toContain("on conflict (organization_id, event_key) do nothing");
    expect(sql).toContain("(is_read = false and read_at is null)");
    expect(sql).toContain("read_at = coalesce(read_at, now())");
    expect(sql).toContain("proposal_sent:");
    expect(sql).toContain("invoice_issued:");
    expect(sql).toContain("payment:");
    expect(sql).toContain("task_assigned:");
    expect(sql).not.toContain("internal_notes");
    expect(sql).not.toContain("recorded_by");
    expect(sql).toContain("public.client_users");
    expect(sql).toContain("'owner'::public.org_role, 'admin'::public.org_role");
    expect(sql).toContain("expires_at > now()");
    expect(sql).not.toContain("expires_at =");
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).toContain("revoke all on function public.enqueue_notification");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toContain("grant execute on function public.enqueue_notification");
    expect(sql).not.toContain("grant execute on function public.notify_invoice_transition");
    expect(sql).toContain("error_code is null");
  });
});
