"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  acceptInvitationAction,
  createOrganizationAction,
} from "@/actions/organizations";
import type { ActionResult } from "@/lib/errors";

const createInitial: ActionResult<{ organizationId: string }> | null = null;
const acceptInitial: ActionResult<{ organizationId: string }> | null = null;

export function CreateOrganizationForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createOrganizationAction,
    createInitial,
  );

  useEffect(() => {
    if (state?.ok) {
      router.replace("/dashboard");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">
          Organization name
        </span>
        <input
          name="name"
          required
          className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Timezone</span>
        <input
          name="timezone"
          defaultValue="UTC"
          required
          className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">
          Default currency
        </span>
        <input
          name="defaultCurrency"
          defaultValue="USD"
          required
          maxLength={3}
          className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-zinc-900"
        />
      </label>
      {state && !state.ok ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-[#17356b] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create organization"}
      </button>
    </form>
  );
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    acceptInvitationAction,
    acceptInitial,
  );

  useEffect(() => {
    if (state?.ok) {
      router.replace("/dashboard");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm leading-6 text-zinc-600">
        Accept this invitation using the email address associated with your
        account.
      </p>
      {state && !state.ok ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-[#17356b] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Joining…" : "Accept invitation"}
      </button>
    </form>
  );
}
