"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction, updateProjectAction } from "@/actions/projects";
import { buttonClass, fieldClass, labelize } from "@/components/operations/styles";
import type { ActionResult } from "@/lib/errors";

const STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;

type ProjectValues = {
  id?: string;
  clientId: string;
  name: string;
  description: string | null;
  status: (typeof STATUSES)[number];
  startDate: string | null;
  deadline: string | null;
  budget: number | null;
};

const initial: ActionResult<{ id: string }> | null = null;

export function ProjectForm({
  clients,
  project,
  initialClientId = "",
  initialName = "",
  initialBudget = "",
}: {
  clients: Array<{ id: string; name: string }>;
  project?: ProjectValues;
  initialClientId?: string;
  initialName?: string;
  initialBudget?: string;
}) {
  const router = useRouter();
  const action = project?.id ? updateProjectAction : createProjectAction;
  const [state, formAction, pending] = useActionState(action, initial);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/dashboard/projects/${state.data.id}`);
      router.refresh();
    }
  }, [router, state]);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {project?.id ? <input type="hidden" name="id" value={project.id} /> : null}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Client</span>
        <select
          name="clientId"
          required
          defaultValue={project?.clientId ?? initialClientId}
          className={fieldClass}
        >
          <option value="" disabled>
            Select a client
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Project name</span>
        <input name="name" required defaultValue={project?.name ?? initialName} className={fieldClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Description</span>
        <textarea
          name="description"
          rows={4}
          defaultValue={project?.description ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Status</span>
        <select name="status" defaultValue={project?.status ?? "planning"} className={fieldClass}>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {labelize(status)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Start date</span>
          <input
            type="date"
            name="startDate"
            defaultValue={project?.startDate ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">Deadline</span>
          <input
            type="date"
            name="deadline"
            defaultValue={project?.deadline ?? ""}
            className={fieldClass}
          />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Budget</span>
        <input
          name="budget"
          inputMode="decimal"
          defaultValue={project?.budget ?? initialBudget}
          className={fieldClass}
        />
      </label>
      {state && !state.ok ? (
        <p className="text-sm text-red-700" role="alert">{state.error.message}</p>
      ) : null}
      <button type="submit" disabled={pending || clients.length === 0} className={buttonClass}>
        {pending ? "Saving…" : project?.id ? "Save project" : "Create project"}
      </button>
    </form>
  );
}
