"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchOrganizationAction } from "@/actions/organizations";
import type { ActionResult } from "@/lib/errors";

type OrgOption = {
  organizationId: string;
  organizationName: string;
  role: string;
};

const initial: ActionResult<{ organizationId: string }> | null = null;

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrgOption[];
  activeOrganizationId: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(switchOrganizationAction, initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  if (organizations.length <= 1) {
    const only = organizations[0];
    return (
      <p className="truncate text-sm text-zinc-700">
        {only?.organizationName ?? "Organization"}
      </p>
    );
  }

  return (
    <form action={formAction} className="min-w-0">
      <label className="sr-only" htmlFor="organizationId">
        Active organization
      </label>
      <select
        id="organizationId"
        name="organizationId"
        defaultValue={activeOrganizationId}
        disabled={pending}
        className="max-w-full border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        onChange={(event) => {
          const form = event.currentTarget.form;
          if (!form) return;
          startTransition(() => {
            form.requestSubmit();
          });
        }}
      >
        {organizations.map((org) => (
          <option key={org.organizationId} value={org.organizationId}>
            {org.organizationName}
          </option>
        ))}
      </select>
      {state && !state.ok ? (
        <p className="mt-1 text-xs text-red-700">{state.error.message}</p>
      ) : null}
    </form>
  );
}
