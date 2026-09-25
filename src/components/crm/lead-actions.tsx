"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  addLeadActivityAction,
  convertLeadAction,
  deleteLeadAction,
  markLeadLostAction,
  reopenLeadAction,
  setLeadStatusAction,
} from "@/actions/leads";
import { OPEN_LEAD_STATUSES, USER_ACTIVITY_TYPES } from "@/lib/crm/constants";
import { buttonClass, fieldClass, labelize, quietButtonClass } from "@/components/operations/styles";
import { confirmSubmit } from "@/components/ui/confirm-submit";
import type { ActionResult } from "@/lib/errors";

const initialId: ActionResult<{ id: string }> | null = null;
const initialClient: ActionResult<{ clientId: string }> | null = null;

export function LeadActions({
  leadId,
  status,
  canChangeOpenStatus,
  canManage,
  canConvert,
}: {
  leadId: string;
  status: string;
  canChangeOpenStatus: boolean;
  canManage: boolean;
  canConvert: boolean;
}) {
  return (
    <div className="space-y-6">
      {canChangeOpenStatus && status !== "won" && status !== "lost" ? (
        <div className="flex flex-wrap gap-2">
          {OPEN_LEAD_STATUSES.filter((item) => item !== status).map((next) => (
            <StatusButton key={next} leadId={leadId} status={next} />
          ))}
        </div>
      ) : null}
      {canManage && status !== "won" && status !== "lost" ? (
        <MarkLost leadId={leadId} />
      ) : null}
      {canManage && status === "lost" ? <Reopen leadId={leadId} /> : null}
      {canConvert && status !== "won" ? <Convert leadId={leadId} /> : null}
      {canManage ? <DeleteLead leadId={leadId} /> : null}
      <ActivityForm leadId={leadId} />
    </div>
  );
}

function StatusButton({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setLeadStatusAction, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={leadId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" disabled={pending} className={quietButtonClass}>
        Mark {labelize(status)}
      </button>
    </form>
  );
}

function MarkLost({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(markLeadLostAction, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={leadId} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Lost reason</span>
        <input name="lostReason" required className={fieldClass} />
      </label>
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error.message}</p> : null}
      <button type="submit" disabled={pending} className={quietButtonClass}>Mark lost</button>
    </form>
  );
}

function Reopen({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(reopenLeadAction, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={leadId} />
      <select name="status" defaultValue="contacted" className={fieldClass}>
        {OPEN_LEAD_STATUSES.map((status) => (
          <option key={status} value={status}>{labelize(status)}</option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={buttonClass}>Reopen</button>
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error.message}</p> : null}
    </form>
  );
}

function Convert({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(convertLeadAction, initialClient);
  useEffect(() => {
    if (state?.ok) {
      router.push(`/dashboard/clients/${state.data.clientId}`);
      router.refresh();
    }
  }, [router, state]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={leadId} />
      {state && !state.ok ? <p className="mb-2 text-sm text-red-700">{state.error.message}</p> : null}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Converting…" : "Convert to client"}
      </button>
    </form>
  );
}

function DeleteLead({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteLeadAction, initialId);
  useEffect(() => {
    if (state?.ok) {
      router.push("/dashboard/leads");
      router.refresh();
    }
  }, [router, state]);
  return (
    <form action={action} onSubmit={confirmSubmit("Delete this lead? This cannot be undone.")}>
      <input type="hidden" name="id" value={leadId} />
      {state && !state.ok ? <p className="mb-2 text-sm text-red-700">{state.error.message}</p> : null}
      <button type="submit" disabled={pending} className={quietButtonClass}>Delete lead</button>
    </form>
  );
}

function ActivityForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addLeadActivityAction, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action} className="space-y-2 border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Add activity</h2>
      <input type="hidden" name="leadId" value={leadId} />
      <select name="activityType" defaultValue="note" className={fieldClass}>
        {USER_ACTIVITY_TYPES.map((type) => (
          <option key={type} value={type}>{labelize(type)}</option>
        ))}
      </select>
      <textarea name="content" required rows={3} className={fieldClass} />
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error.message}</p> : null}
      <button type="submit" disabled={pending} className={buttonClass}>Add</button>
    </form>
  );
}
