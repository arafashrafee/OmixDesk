"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientAction, deleteClientAction, updateClientAction } from "@/actions/clients";
import { buttonClass, fieldClass } from "@/components/operations/styles";
import { confirmSubmit } from "@/components/ui/confirm-submit";
import type { ActionResult } from "@/lib/errors";

type ClientValues = {
  id?: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

const initial: ActionResult<{ id: string }> | null = null;

export function ClientForm({ client }: { client?: ClientValues }) {
  const router = useRouter();
  const action = client?.id ? updateClientAction : createClientAction;
  const [state, formAction, pending] = useActionState(action, initial);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/dashboard/clients/${state.data.id}`);
      router.refresh();
    }
  }, [router, state]);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {client?.id ? <input type="hidden" name="id" value={client.id} /> : null}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Name</span>
        <input name="name" required defaultValue={client?.name ?? ""} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Company</span>
        <input name="company" defaultValue={client?.company ?? ""} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Email</span>
        <input name="email" type="email" defaultValue={client?.email ?? ""} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Phone</span>
        <input name="phone" defaultValue={client?.phone ?? ""} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Address</span>
        <textarea name="address" rows={2} defaultValue={client?.address ?? ""} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Internal notes</span>
        <textarea name="notes" rows={4} defaultValue={client?.notes ?? ""} className={fieldClass} />
      </label>
      {state && !state.ok ? (
        <p className="text-sm text-red-700" role="alert">{state.error.message}</p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : client?.id ? "Save client" : "Create client"}
      </button>
    </form>
  );
}

export function DeleteClientButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteClientAction, initial);
  useEffect(() => {
    if (state?.ok) {
      router.push("/dashboard/clients");
      router.refresh();
    }
  }, [router, state]);

  return (
    <form action={formAction} onSubmit={confirmSubmit("Delete this client? This cannot be undone.")}>
      <input type="hidden" name="id" value={clientId} />
      {state && !state.ok ? (
        <p className="mb-2 text-sm text-red-700">{state.error.message}</p>
      ) : null}
      <button type="submit" disabled={pending} className="border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 disabled:opacity-60">
        Delete client
      </button>
    </form>
  );
}
