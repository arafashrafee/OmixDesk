"use client";

import { useActionState, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { createInvoiceAction, updateInvoiceAction } from "@/actions/invoices";
import { calculateInvoiceMoney } from "@/lib/billing/rules";
import { buttonClass, fieldClass } from "@/components/operations/styles";
import type { ActionResult } from "@/lib/errors";

type Line = { description: string; quantity: string; unitPrice: string };

export type InvoiceFormValues = {
  id?: string;
  title: string;
  clientId: string;
  projectId: string;
  proposalId: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  recipientName: string;
  recipientCompany: string;
  recipientEmail: string;
  recipientPhone: string;
  recipientAddress: string;
  notes: string;
  terms: string;
  internalNotes: string;
  discountType: "" | "fixed" | "percentage";
  discountValue: string;
  taxPercent: string;
  items: Line[];
};

const initial: ActionResult<{ id: string }> | null = null;
const emptyLine = (): Line => ({ description: "", quantity: "1", unitPrice: "0" });

export function InvoiceForm({
  invoice,
  clients,
  projects,
}: {
  invoice?: InvoiceFormValues;
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; clientId: string }>;
}) {
  const router = useRouter();
  const action = invoice?.id ? updateInvoiceAction : createInvoiceAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const [lines, setLines] = useState<Line[]>(invoice?.items ?? [emptyLine()]);
  const [clientId, setClientId] = useState(invoice?.clientId ?? "");
  const [projectId, setProjectId] = useState(invoice?.projectId ?? "");
  const [discountType, setDiscountType] = useState(invoice?.discountType ?? "");
  const [discountValue, setDiscountValue] = useState(invoice?.discountValue ?? "");
  const [taxPercent, setTaxPercent] = useState(invoice?.taxPercent ?? "");

  useEffect(() => {
    if (state?.ok) {
      router.push(`/dashboard/invoices/${state.data.id}`);
      router.refresh();
    }
  }, [router, state]);

  const visibleProjects = projects.filter((project) => project.clientId === clientId);
  const preview = useMemo(() => {
    return calculateInvoiceMoney({
      lines: lines.map((line) => ({
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
      })),
      discountType: discountType === "" ? null : discountType,
      discountValue: discountValue === "" ? null : Number(discountValue),
      taxPercent: taxPercent === "" ? null : Number(taxPercent),
    });
  }, [discountType, discountValue, lines, taxPercent]);

  return (
    <form action={formAction} className="max-w-3xl space-y-4">
      {invoice?.id ? <input type="hidden" name="id" value={invoice.id} /> : null}
      <input type="hidden" name="proposalId" value={invoice?.proposalId ?? ""} />
      <input type="hidden" name="items" value={JSON.stringify(lines)} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Title</span>
        <input name="title" required defaultValue={invoice?.title ?? ""} className={fieldClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Client</span>
          <select
            name="clientId"
            required
            value={clientId}
            onChange={(event) => {
              const nextClient = event.target.value;
              setClientId(nextClient);
              setProjectId((current) =>
                projects.some((project) => project.id === current && project.clientId === nextClient) ? current : "",
              );
            }}
            className={fieldClass}
          >
            <option value="">Select a client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Project</span>
          <select name="projectId" value={projectId} onChange={(event) => setProjectId(event.target.value)} className={fieldClass}>
            <option value="">None</option>
            {visibleProjects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Issue date</span>
          <input type="date" name="issueDate" required defaultValue={invoice?.issueDate ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Due date</span>
          <input type="date" name="dueDate" required defaultValue={invoice?.dueDate ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Currency</span>
          <input name="currency" required defaultValue={invoice?.currency ?? "BDT"} className={fieldClass} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Bill to</span>
          <input name="recipientName" required defaultValue={invoice?.recipientName ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Company</span>
          <input name="recipientCompany" defaultValue={invoice?.recipientCompany ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Email</span>
          <input name="recipientEmail" defaultValue={invoice?.recipientEmail ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Phone</span>
          <input name="recipientPhone" defaultValue={invoice?.recipientPhone ?? ""} className={fieldClass} />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Address</span>
        <textarea name="recipientAddress" defaultValue={invoice?.recipientAddress ?? ""} className={fieldClass} rows={2} />
      </label>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Items</h2>
          <button type="button" className="text-sm underline" onClick={() => setLines((current) => [...current, emptyLine()])}>
            Add item
          </button>
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem_auto]">
            <input
              value={line.description}
              onChange={(event) => updateLine(setLines, index, { description: event.target.value })}
              placeholder="Description"
              className={fieldClass}
            />
            <input
              value={line.quantity}
              onChange={(event) => updateLine(setLines, index, { quantity: event.target.value })}
              className={fieldClass}
            />
            <input
              value={line.unitPrice}
              onChange={(event) => updateLine(setLines, index, { unitPrice: event.target.value })}
              className={fieldClass}
            />
            <button
              type="button"
              className="text-sm text-zinc-500"
              onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Discount</span>
          <select name="discountType" value={discountType} onChange={(event) => setDiscountType(event.target.value as InvoiceFormValues["discountType"])} className={fieldClass}>
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
      <p className="text-sm text-zinc-600">
        Preview total {preview.ok ? preview.totals.total.toFixed(2) : "unavailable"}. The database recalculates this on save.
      </p>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Notes for the client</span>
        <textarea name="notes" defaultValue={invoice?.notes ?? ""} className={fieldClass} rows={3} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Terms</span>
        <textarea name="terms" defaultValue={invoice?.terms ?? ""} className={fieldClass} rows={3} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Internal notes</span>
        <textarea name="internalNotes" defaultValue={invoice?.internalNotes ?? ""} className={fieldClass} rows={3} />
      </label>
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error.message}</p> : null}
      <button disabled={pending} className={buttonClass} type="submit">
        {pending ? "Saving…" : "Save draft"}
      </button>
    </form>
  );
}

function updateLine(
  setLines: Dispatch<SetStateAction<Line[]>>,
  index: number,
  patch: Partial<Line>,
) {
  setLines((current) => current.map((line, itemIndex) => (itemIndex === index ? { ...line, ...patch } : line)));
}
