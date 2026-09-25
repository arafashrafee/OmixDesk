import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calculateProposalMoney, formatProposalNumber, roundMoney } from "@/lib/proposals/money";
import {
  canTransitionProposal,
  proposalCanBeDeleted,
  proposalSourceIsExclusive,
  toPrintableProposal,
} from "@/lib/proposals/rules";
import { canReadProposals, canWriteProposals } from "@/lib/rbac";
import { firstAffected } from "@/lib/operations/mutation";
import { proposalFormSchema } from "@/lib/validations/proposals";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260925000002_phase4_proposals.sql"),
  "utf8",
);

describe("proposal permissions", () => {
  it("lets staff read and only managers write", () => {
    for (const role of ["owner", "admin", "project_manager", "member"] as const) {
      expect(canReadProposals(role)).toBe(true);
    }
    expect(canWriteProposals("owner")).toBe(true);
    expect(canWriteProposals("project_manager")).toBe(true);
    expect(canWriteProposals("member")).toBe(false);
    expect(canReadProposals("client")).toBe(false);
    expect(canWriteProposals("client")).toBe(false);
  });
});

describe("proposal ownership and status", () => {
  it("requires exactly one source", () => {
    expect(proposalSourceIsExclusive({ leadId: "a", clientId: null })).toBe(true);
    expect(proposalSourceIsExclusive({ leadId: null, clientId: "b" })).toBe(true);
    expect(proposalSourceIsExclusive({ leadId: "a", clientId: "b" })).toBe(false);
    expect(proposalSourceIsExclusive({ leadId: null, clientId: null })).toBe(false);
  });

  it("allows only the documented lifecycle and draft deletion", () => {
    expect(canTransitionProposal("draft", "sent")).toBe(true);
    expect(canTransitionProposal("sent", "accepted")).toBe(true);
    expect(canTransitionProposal("sent", "draft")).toBe(false);
    expect(canTransitionProposal("accepted", "draft")).toBe(false);
    expect(canTransitionProposal("rejected", "draft")).toBe(true);
    expect(canTransitionProposal("expired", "draft")).toBe(true);
    expect(proposalCanBeDeleted("draft")).toBe(true);
    expect(proposalCanBeDeleted("accepted")).toBe(false);
    expect(proposalCanBeDeleted("sent")).toBe(false);
  });
});

describe("proposal money", () => {
  it("rounds line totals and rejects a fixed discount above the subtotal", () => {
    expect(roundMoney(10.235)).toBe(10.24);
    const priced = calculateProposalMoney({
      lines: [
        { quantity: 2, unitPrice: 10.1 },
        { quantity: 1, unitPrice: 5 },
      ],
      discountType: "fixed",
      discountValue: 100,
      taxPercent: null,
    });
    expect(priced.ok).toBe(false);
  });

  it("applies percentage discount and tax without a negative total", () => {
    const priced = calculateProposalMoney({
      lines: [{ quantity: 1, unitPrice: 200 }],
      discountType: "percentage",
      discountValue: 10,
      taxPercent: 5,
    });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.totals.subtotal).toBe(200);
    expect(priced.totals.discountAmount).toBe(20);
    expect(priced.totals.taxAmount).toBe(9);
    expect(priced.totals.total).toBe(189);
  });

  it("rejects a percentage above 100", () => {
    expect(
      calculateProposalMoney({
        lines: [{ quantity: 1, unitPrice: 50 }],
        discountType: "percentage",
        discountValue: 150,
        taxPercent: 0,
      }).ok,
    ).toBe(false);
  });
});

describe("proposal print and numbering", () => {
  it("formats organization sequence numbers and omits internal notes", () => {
    expect(formatProposalNumber(2026, 1)).toBe("OMX-2026-0001");
    const printable = toPrintableProposal({
      proposalNumber: "OMX-2026-0001",
      title: "Website",
      recipientName: "Ada",
      clientNotes: "Visible",
      internalNotes: "Do not print",
      total: 100,
      currency: "USD",
    });
    expect(printable).not.toHaveProperty("internalNotes");
    expect(JSON.stringify(printable)).not.toContain("Do not print");
  });

  it("rejects both a lead and a client in the form schema", () => {
    const parsed = proposalFormSchema.safeParse({
      title: "Site",
      leadId: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      issueDate: "2026-09-25",
      validUntil: "",
      currency: "usd",
      recipientName: "Ada",
      recipientCompany: "",
      recipientEmail: "",
      recipientPhone: "",
      recipientAddress: "",
      introduction: "",
      scope: "",
      terms: "",
      clientNotes: "",
      internalNotes: "",
      discountType: "",
      discountValue: "",
      taxPercent: "",
      items: [{ name: "Build", description: "", quantity: 1, unitPrice: 10 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("treats an empty write as no access", () => {
    expect(firstAffected([])).toBeNull();
  });
});

describe("phase 4 migration security contract", () => {
  it("forces RLS, keeps numbering atomic, and withholds counter access", () => {
    expect(sql).toContain("alter table public.proposals force row level security");
    expect(sql).toContain("alter table public.proposal_items force row level security");
    expect(sql).toContain("alter table public.proposal_number_counters force row level security");
    expect(sql).toContain("on conflict (organization_id, year)");
    expect(sql).toContain("revoke all on table public.proposal_number_counters from public, anon, authenticated");
    expect(sql).toContain("function public.save_draft_proposal");
    expect(sql).toContain("revoke all on function public.assign_proposal_number() from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.apply_proposal_totals() from public, anon, authenticated");
    expect(sql).not.toContain("grant execute on function public.assign_proposal_number()");
    expect(sql).toContain("grant execute on function public.save_draft_proposal(uuid, uuid, jsonb) to authenticated");
    expect(sql).toContain("constraint proposals_one_source");
    expect(sql).toContain("constraint proposals_lead_same_org");
    expect(sql).toContain("constraint proposals_client_same_org");
    expect(sql).not.toMatch(/service_role/i);
  });
});
