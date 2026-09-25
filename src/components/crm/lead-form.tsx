"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createLeadAction, updateLeadAction } from "@/actions/leads";
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  OPEN_LEAD_STATUSES,
  SERVICE_INTERESTS,
} from "@/lib/crm/constants";
import { buttonClass, fieldClass, labelize } from "@/components/operations/styles";
import type { ActionResult } from "@/lib/errors";

type LeadValues = {
  id?: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  serviceInterest: string | null;
  estimatedValue: number | null;
  status: (typeof OPEN_LEAD_STATUSES)[number];
  priority: (typeof LEAD_PRIORITIES)[number];
  assignedTo: string | null;
  nextFollowUp: string;
  notes: string | null;
  lockStatus?: boolean;
};

const initial: ActionResult<{ id: string }> | null = null;

export function LeadForm({
  lead,
  staff,
  canAssign,
  selfId,
}: {
  lead?: LeadValues;
  staff: Array<{ userId: string; label: string }>;
  canAssign: boolean;
  selfId: string;
}) {
  const router = useRouter();
  const action = lead?.id ? updateLeadAction : createLeadAction;
  const [state, formAction, pending] = useActionState(action, initial);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/dashboard/leads/${state.data.id}`);
      router.refresh();
    }
  }, [router, state]);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {lead?.id ? <input type="hidden" name="id" value={lead.id} /> : null}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Name</span>
        <input name="name" required defaultValue={lead?.name ?? ""} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Company</span>
        <input name="company" defaultValue={lead?.company ?? ""} className={fieldClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Email</span>
          <input name="email" type="email" defaultValue={lead?.email ?? ""} className={fieldClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Phone</span>
          <input name="phone" defaultValue={lead?.phone ?? ""} className={fieldClass} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Source</span>
          <select name="source" defaultValue={lead?.source ?? ""} className={fieldClass}>
            <option value="">Not set</option>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Service interest</span>
          <select name="serviceInterest" defaultValue={lead?.serviceInterest ?? ""} className={fieldClass}>
            <option value="">Not set</option>
            {SERVICE_INTERESTS.map((service) => (
              <option key={service} value={service}>{service}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Status</span>
          {lead?.lockStatus ? (
            <input type="hidden" name="status" value={lead.status} />
          ) : null}
          <select
            name={lead?.lockStatus ? undefined : "status"}
            defaultValue={lead?.status ?? "new"}
            disabled={lead?.lockStatus}
            className={fieldClass}
          >
            {OPEN_LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>{labelize(status)}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Priority</span>
          <select name="priority" defaultValue={lead?.priority ?? "medium"} className={fieldClass}>
            {LEAD_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Estimated value</span>
        <input
          name="estimatedValue"
          inputMode="decimal"
          defaultValue={lead?.estimatedValue ?? ""}
          className={fieldClass}
        />
      </label>
      {canAssign ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Assigned to</span>
          <select name="assignedTo" defaultValue={lead?.assignedTo ?? ""} className={fieldClass}>
            <option value="">Unassigned</option>
            {staff.map((person) => (
              <option key={person.userId} value={person.userId}>{person.label}</option>
            ))}
          </select>
        </label>
      ) : (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Assign to me</span>
        <select name="assignedTo" defaultValue={lead?.assignedTo ?? ""} className={fieldClass}>
          <option value="">Leave unassigned</option>
          <option value={selfId}>Assign to me</option>
        </select>
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Next follow-up (UTC)</span>
        <input
          type="datetime-local"
          name="nextFollowUp"
          defaultValue={lead?.nextFollowUp ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Notes</span>
        <textarea name="notes" rows={4} defaultValue={lead?.notes ?? ""} className={fieldClass} />
      </label>
      {state && !state.ok ? (
        <p className="text-sm text-red-700" role="alert">{state.error.message}</p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : lead?.id ? "Save lead" : "Create lead"}
      </button>
    </form>
  );
}
