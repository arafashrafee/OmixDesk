"use client";

import { useActionState } from "react";
import { invitePortalUserAction, resendPortalInvitationAction, revokePortalUserAction } from "@/actions/portal";
import { buttonClass, fieldClass, quietButtonClass } from "@/components/operations/styles";
import { confirmSubmit } from "@/components/ui/confirm-submit";
import { deliveryNotice } from "@/lib/email/status";
import type { DeliveryOutcome } from "@/lib/email/dispatch";
import type { ActionResult } from "@/lib/errors";

export function PortalAccessPanel({
  clientId,
  users,
  canInvite,
  canRevoke,
}: {
  clientId: string;
  users: Array<{ userId: string; label: string }>;
  canInvite: boolean;
  canRevoke: boolean;
}) {
  const [inviteState, inviteAction, invitePending] = useActionState(
    invitePortalUserAction,
    null as ActionResult<{ inviteUrl: string; email: DeliveryOutcome; invitationId: string }> | null,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokePortalUserAction,
    null as ActionResult<{ ok: true }> | null,
  );

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-zinc-900">Portal access</h2>
      {users.length === 0 ? (
        <p className="text-sm text-zinc-500">No portal users linked.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
          {users.map((user) => (
            <li key={user.userId} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{user.label}</span>
              {canRevoke ? (
                <form action={revokeAction} onSubmit={confirmSubmit("Revoke this person's portal access?")}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <input type="hidden" name="userId" value={user.userId} />
                  <button disabled={revokePending} className={quietButtonClass} type="submit">
                    Revoke
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {revokeState && !revokeState.ok ? <p className="text-sm text-red-700">{revokeState.error.message}</p> : null}
      {canInvite ? (
        <form action={inviteAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="clientId" value={clientId} />
          <label className="space-y-1 text-sm">
            <span className="font-medium text-zinc-800">Invite email</span>
            <input name="email" type="email" required className={fieldClass} />
          </label>
          <button disabled={invitePending} className={buttonClass} type="submit">
            Invite to portal
          </button>
        </form>
      ) : null}
      {inviteState?.ok ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-700">{deliveryNotice(inviteState.data.email, "invitation")}</p>
          <p className="break-all text-sm text-zinc-700">{inviteState.data.inviteUrl}</p>
          {inviteState.data.invitationId ? (
            <ResendInvite invitationId={inviteState.data.invitationId} />
          ) : null}
        </div>
      ) : null}
      {inviteState && !inviteState.ok ? <p className="text-sm text-red-700">{inviteState.error.message}</p> : null}
    </section>
  );
}

function ResendInvite({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(
    resendPortalInvitationAction,
    null as ActionResult<{ inviteUrl: string; email: DeliveryOutcome }> | null,
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      <button disabled={pending} className={quietButtonClass} type="submit">
        Resend email
      </button>
      {state?.ok ? (
        <>
          <p className="text-sm text-zinc-700">{deliveryNotice(state.data.email, "invitation")}</p>
          <p className="break-all text-sm text-zinc-700">{state.data.inviteUrl}</p>
        </>
      ) : null}
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error.message}</p> : null}
    </form>
  );
}
