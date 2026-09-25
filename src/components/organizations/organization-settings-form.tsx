"use client";

import { useActionState } from "react";
import {
  createInvitationAction,
  resendStaffInvitationAction,
  updateOrganizationAction,
} from "@/actions/organizations";
import type { ActionResult } from "@/lib/errors";
import { deliveryNotice } from "@/lib/email/status";
import { can, type OrgRole } from "@/lib/rbac";

const updateInitial: ActionResult<{ organizationId: string }> | null = null;
const inviteInitial: ActionResult<{ inviteUrl: string; email: "sent" | "failed" | "not_configured" | "skipped"; invitationId: string }> | null = null;

export function OrganizationSettingsForm({
  role,
  name,
  timezone,
  defaultCurrency,
  email,
  phone,
  address,
  website,
}: {
  role: OrgRole;
  name: string;
  timezone: string;
  defaultCurrency: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}) {
  const canManage = can({ role }, "org.settings.manage");
  const canInvite = can({ role }, "org.members.manage");
  const [updateState, updateAction, updatePending] = useActionState(
    updateOrganizationAction,
    updateInitial,
  );
  const [inviteState, inviteAction, invitePending] = useActionState(
    createInvitationAction,
    inviteInitial,
  );

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <h1 className="font-semibold text-zinc-900">Organization settings</h1>
        <form action={updateAction} className="max-w-lg space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">Name</span>
            <input
              name="name"
              defaultValue={name}
              required
              disabled={!canManage}
              className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-50"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">Timezone</span>
            <input
              name="timezone"
              defaultValue={timezone}
              required
              disabled={!canManage}
              className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-50"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">
              Default currency
            </span>
            <input
              name="defaultCurrency"
              defaultValue={defaultCurrency}
              required
              maxLength={3}
              disabled={!canManage}
              className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-zinc-900 disabled:bg-zinc-50"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">Email</span>
            <input name="email" type="email" defaultValue={email} disabled={!canManage} className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-50" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">Phone</span>
            <input name="phone" defaultValue={phone} disabled={!canManage} className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-50" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">Address</span>
            <textarea name="address" rows={2} defaultValue={address} disabled={!canManage} className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-50" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">Website</span>
            <input name="website" defaultValue={website} disabled={!canManage} className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-50" />
          </label>
          {updateState && !updateState.ok ? (
            <p className="text-sm text-red-700">{updateState.error.message}</p>
          ) : null}
          {updateState?.ok ? (
            <p className="text-sm text-zinc-600">Settings saved.</p>
          ) : null}
          {canManage ? (
            <button
              type="submit"
              disabled={updatePending}
              className="bg-[#17356b] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {updatePending ? "Saving…" : "Save settings"}
            </button>
          ) : (
            <p className="text-sm text-zinc-500">
              Only owners and admins can change organization settings.
            </p>
          )}
        </form>
      </section>

      {canInvite ? (
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-semibold text-zinc-900">
            Invite staff
          </h2>
          <form action={inviteAction} className="max-w-lg space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-800">Email</span>
              <input
                name="email"
                type="email"
                required
                className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-800">Role</span>
              <select
                name="role"
                defaultValue="member"
                className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
              >
                <option value="admin">Admin</option>
                <option value="project_manager">Project Manager</option>
                <option value="member">Member</option>
              </select>
            </label>
            {inviteState && !inviteState.ok ? (
              <p className="text-sm text-red-700">{inviteState.error.message}</p>
            ) : null}
            {inviteState?.ok ? (
              <div className="space-y-2 border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                <p>{deliveryNotice(inviteState.data.email, "invitation")}</p>
                <p className="break-all">{inviteState.data.inviteUrl}</p>
                {inviteState.data.invitationId ? (
                  <ResendStaffInvite invitationId={inviteState.data.invitationId} />
                ) : null}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={invitePending}
              className="bg-[#17356b] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {invitePending ? "Creating…" : "Create invitation"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function ResendStaffInvite({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(
    resendStaffInvitationAction,
    null as ActionResult<{ inviteUrl: string; email: "sent" | "failed" | "not_configured" | "skipped" }> | null,
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      <button disabled={pending} className="border border-zinc-300 px-3 py-2 text-sm" type="submit">
        Resend email
      </button>
      {state?.ok ? (
        <>
          <p>{deliveryNotice(state.data.email, "invitation")}</p>
          <p className="break-all">{state.data.inviteUrl}</p>
        </>
      ) : null}
      {state && !state.ok ? <p className="text-red-700">{state.error.message}</p> : null}
    </form>
  );
}
