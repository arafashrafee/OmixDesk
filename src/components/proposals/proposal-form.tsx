"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createProposalAction, updateProposalAction } from "@/actions/proposals";
import { calculateProposalMoney } from "@/lib/proposals/money";
import { buttonClass, fieldClass } from "@/components/operations/styles";
import type { ActionResult } from "@/lib/errors";

type Line = { name: string; description: string; quantity: string; unitPrice: string };

type ProposalValues = {
  id?: string;
  title: string;
  leadId: string;
  clientId: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  recipientName: string;
  recipientCompany: string;
  recipientEmail: string;
  recipientPhone: string;
  recipientAddress: string;
  introduction: string;
  scope: string;
  terms: string;
  clientNotes: string;
  internalNotes: string;
  discountType: "" | "fixed" | "percentage";
  discountValue: string;
  taxPercent: string;
  items: Line[];
};

const initial: ActionResult<{ id: string }> | null = null;
const emptyLine = (): Line => ({ name: "", description: "", quantity: "1", unitPrice: "0" });

export function ProposalForm({
  proposal,
  leads,
  clients,
  lockSource,
}: {
  proposal?: ProposalValues;
  leads: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  lockSource?: boolean;
}) {
  const router = useRouter();
  const action = proposal?.id ? updateProposalAction : createProposalAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const [lines, setLines] = useState<Line[]>(proposal?.items ?? [emptyLine()]);
  const [discountType, setDiscountType] = useState(proposal?.discountType ?? "");
  const [discountValue, setDiscountValue] = useState(proposal?.discountValue ?? "");
  const [taxPercent, setTaxPercent] = useState(proposal?.taxPercent ?? "");

  useEffect(() => {
    if (state?.ok) {
      router.push(`/dashboard/proposals/${state.data.id}`);
      router.refresh();
    }
  }, [router, state]);

  const preview = useMemo(() => {
    return calculateProposalMoney({
      lines: lines.map((line) => ({
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
      })),
      discountType: discountType === "" ? null : discountType,
      discountValue: discountValue === "" ? null : Number(discountValue),
      taxPercent: taxPercent === "" ? null : Number(taxPercent),
    });
  }, [discountType, discountValue, lines, taxPercent]);

  const source = proposal?.clientId ? "client" : "lead";

  return (
    <form action={formAction} className="max-w-3xl space-y-4">
      {proposal?.id ? <input type="hidden" name="id" value={proposal.id} /> : null}
      <input type="hidden" name="items" value={JSON.stringify(lines)} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Title</span>
        <input name="title" required defaultValue={proposal?.title ?? ""} className={fieldClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Lead</span>
          {lockSource && source === "client" ? <input type="hidden" name="leadId" value="" /> : null}
          <select name={lockSource && source === "client" ? undefined : "leadId"} defaultValue={proposal?.leadId ?? ""} disabled={lockSource && source === "client"} className={fieldClass}>
            <option value="">None</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>{lead.name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Client</span>
          {lockSource && source === "lead" ? <input type="hidden" name="clientId" value="" /> : null}
          <select name={lockSource && source === "lead" ? undefined : "clientId"} defaultValue={proposal?.clientId ?? ""} disabled={lockSource && source === "lead"} className={fieldClass}>
            <option value="">None</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-zinc-500">Choose a lead or a client, not both.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Issue date</span>
          <input type="date" name="issueDate" required defaultValue={proposal?.issueDate ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Valid until</span>
          <input type="date" name="validUntil" defaultValue={proposal?.validUntil ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Currency</span>
          <input name="currency" required maxLength={3} defaultValue={proposal?.currency ?? ""} className={fieldClass} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Recipient name</span>
          <input name="recipientName" required defaultValue={proposal?.recipientName ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Company</span>
          <input name="recipientCompany" defaultValue={proposal?.recipientCompany ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Email</span>
          <input name="recipientEmail" type="email" defaultValue={proposal?.recipientEmail ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Phone</span>
          <input name="recipientPhone" defaultValue={proposal?.recipientPhone ?? ""} className={fieldClass} />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Address</span>
        <textarea name="recipientAddress" rows={2} defaultValue={proposal?.recipientAddress ?? ""} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Introduction</span>
        <textarea name="introduction" rows={3} defaultValue={proposal?.introduction ?? ""} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Scope of work</span>
        <textarea name="scope" rows={4} defaultValue={proposal?.scope ?? ""} className={fieldClass} />
      </label>
      <div className="space-y-3 border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Line items</h2>
          <button
            type="button"
            className="border border-zinc-300 px-2 py-1 text-xs"
            onClick={() => setLines((current) => [...current, emptyLine()])}
          >
            Add line
          </button>
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-6">
            <input
              value={line.name}
              placeholder="Name"
              className={`${fieldClass} sm:col-span-2`}
              onChange={(event) => updateLine(index, { name: event.target.value })}
            />
            <input
              value={line.description}
              placeholder="Description"
              className={`${fieldClass} sm:col-span-2`}
              onChange={(event) => updateLine(index, { description: event.target.value })}
            />
            <input
              value={line.quantity}
              inputMode="decimal"
              className={fieldClass}
              onChange={(event) => updateLine(index, { quantity: event.target.value })}
            />
            <input
              value={line.unitPrice}
              inputMode="decimal"
              className={fieldClass}
              onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
            />
          </div>
        ))}
        <p className="text-sm text-zinc-600">
          {preview.ok
            ? `Preview total ${preview.totals.total.toFixed(2)} (saved totals come from the database)`
            : preview.message}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Discount</span>
          <select name="discountType" value={discountType} onChange={(event) => setDiscountType(event.target.value as "" | "fixed" | "percentage")} className={fieldClass}>
            <option value="">None</option>
            <option value="fixed">Fixed</option>
            <option value="percentage">Percentage</option>
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Discount value</span>
          <input name="discountValue" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Tax percent</span>
          <input name="taxPercent" value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} className={fieldClass} />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Terms</span>
        <textarea name="terms" rows={3} defaultValue={proposal?.terms ?? ""} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Client-facing notes</span>
        <textarea name="clientNotes" rows={3} defaultValue={proposal?.clientNotes ?? ""} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Internal notes</span>
        <textarea name="internalNotes" rows={3} defaultValue={proposal?.internalNotes ?? ""} className={fieldClass} />
      </label>
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error.message}</p> : null}
      <button disabled={pending} className={buttonClass} type="submit">
        {pending ? "Saving…" : proposal?.id ? "Save draft" : "Create draft"}
      </button>
    </form>
  );

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }
}
