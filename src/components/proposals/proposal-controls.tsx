"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteProposalAction, setProposalStatusAction } from "@/actions/proposals";
import { convertLeadAction } from "@/actions/leads";
import { confirmSubmit } from "@/components/ui/confirm-submit";
import { quietButtonClass, buttonClass, destructiveButtonClass } from "@/components/operations/styles";
import { deliveryNotice } from "@/lib/email/status";
import type { DeliveryOutcome } from "@/lib/email/dispatch";
import type { ProposalStatus } from "@/lib/proposals/rules";
import { canTransitionProposal } from "@/lib/proposals/rules";
import type { ActionResult } from "@/lib/errors";

const initial: ActionResult<{ id: string; email?: DeliveryOutcome }> | null = null;

export function ProposalControls({
  proposalId,
  status,
  leadId,
  clientId,
  showConvert,
  projectHref,
}: {
  proposalId: string;
  status: ProposalStatus;
  leadId: string | null;
  clientId: string | null;
  showConvert: boolean;
  projectHref: string | null;
}) {
  const options: ProposalStatus[] = ["sent", "accepted", "rejected", "expired", "draft"];

  return (
    <div className="document-actions">
      <div className="flex flex-wrap gap-2">
        {options.filter((next) => canTransitionProposal(status, next)).map((next) => (
          <StatusButton key={next} proposalId={proposalId} status={next} />
        ))}
        {status === "draft" ? <DeleteButton proposalId={proposalId} /> : null}
      </div>
      {status === "accepted" && showConvert && leadId ? (
        <ConvertLead leadId={leadId} />
      ) : null}
      {status === "accepted" && clientId && projectHref ? (
        <a href={projectHref} className="inline-flex border border-zinc-300 bg-white px-3 py-2 text-sm">
          Create project
        </a>
      ) : null}
    </div>
  );
}

function StatusButton({ proposalId, status }: { proposalId: string; status: ProposalStatus }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setProposalStatusAction, initial);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={proposalId} />
      <input type="hidden" name="status" value={status} />
      <button disabled={pending} className={status === "sent" || status === "accepted" ? buttonClass : quietButtonClass} type="submit">
        {pending ? "Working…" : `Mark ${status}`}
      </button>
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error.message}</p> : null}
      {state?.ok && state.data.email && state.data.email !== "skipped" ? (
        <p className="text-sm text-zinc-700">{deliveryNotice(state.data.email)}</p>
      ) : null}
    </form>
  );
}

function ConvertLead({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(convertLeadAction, null);
  useEffect(() => {
    if (state?.ok) {
      router.push(`/dashboard/clients/${state.data.clientId}`);
      router.refresh();
    }
  }, [router, state]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={leadId} />
      <button disabled={pending} className={quietButtonClass} type="submit">
        Convert lead to client
      </button>
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error.message}</p> : null}
    </form>
  );
}

function DeleteButton({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteProposalAction, initial);
  useEffect(() => {
    if (state?.ok) {
      router.push("/dashboard/proposals");
      router.refresh();
    }
  }, [router, state]);
  return (
    <form action={action} onSubmit={confirmSubmit("Delete this draft proposal? This cannot be undone.")}>
      <input type="hidden" name="id" value={proposalId} />
      <button disabled={pending} className={destructiveButtonClass} type="submit">Delete draft</button>
    </form>
  );
}
