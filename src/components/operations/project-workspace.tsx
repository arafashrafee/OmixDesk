"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteProjectAction } from "@/actions/projects";
import {
  createMilestoneAction,
  deleteMilestoneAction,
  updateMilestoneStatusAction,
} from "@/actions/milestones";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/actions/tasks";
import {
  addProjectMemberAction,
  removeProjectMemberAction,
} from "@/actions/project-members";
import {
  createFileDownloadAction,
  deleteFileAction,
  setFileVisibilityAction,
  uploadFileAction,
} from "@/actions/files";
import { buttonClass, fieldClass, labelize, quietButtonClass } from "@/components/operations/styles";
import { confirmSubmit } from "@/components/ui/confirm-submit";
import type { ActionResult } from "@/lib/errors";
import { formatMilestoneProgress, deriveMilestoneProgress } from "@/lib/operations/progress";

const initialId: ActionResult<{ id: string }> | null = null;
const initialProject: ActionResult<{ projectId: string }> | null = null;
const initialUrl: ActionResult<{ url: string }> | null = null;

function ErrorText({ state }: { state: ActionResult<{ id: string }> | ActionResult<{ projectId: string }> | ActionResult<{ url: string }> | null }) {
  if (!state || state.ok) return null;
  return <p className="text-sm text-red-700">{state.error.message}</p>;
}

export function ProjectSections({
  projectId,
  canWrite,
  canManageTeam,
  canDeleteProject,
  milestones,
  tasks,
  members,
  staff,
  files,
}: {
  projectId: string;
  canWrite: boolean;
  canManageTeam: boolean;
  canDeleteProject: boolean;
  milestones: Array<{
    id: string;
    title: string;
    description: string | null;
    status: "pending" | "completed";
    due_date: string | null;
    sort_order: number;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    status: "todo" | "in_progress" | "done";
    priority: "low" | "medium" | "high" | "urgent";
    assigned_to: string | null;
    due_date: string | null;
    milestone_id: string | null;
    visible_to_client: boolean;
  }>;
  members: Array<{ userId: string; label: string }>;
  staff: Array<{ userId: string; label: string }>;
  files: Array<{
    id: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    visible_to_client: boolean;
  }>;
}) {
  const progress = formatMilestoneProgress(
    deriveMilestoneProgress(milestones.map((milestone) => milestone.status)),
  );
  const assigned = new Set(members.map((member) => member.userId));
  const availableStaff = staff.filter((person) => !assigned.has(person.userId));

  return (
    <div className="space-y-10">
      <section id="overview" className="space-y-2">
        <h2 className="text-base font-semibold text-zinc-900">Overview</h2>
        <p className="text-sm text-zinc-600">Progress is calculated from milestones. {progress}.</p>
        {canDeleteProject ? <DeleteProjectButton projectId={projectId} /> : null}
      </section>

      <section id="milestones" className="space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">Milestones</h2>
        {milestones.length === 0 ? (
          <p className="text-sm text-zinc-500">No milestones yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {milestones.map((milestone) => (
              <li key={milestone.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{milestone.title}</p>
                  <p className="text-xs text-zinc-500">
                    {labelize(milestone.status)}
                    {milestone.due_date ? ` · due ${milestone.due_date}` : ""}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex gap-2">
                    <StatusButton
                      id={milestone.id}
                      projectId={projectId}
                      nextStatus={milestone.status === "completed" ? "pending" : "completed"}
                      label={milestone.status === "completed" ? "Reopen" : "Complete"}
                    />
                    <DeleteButton action={deleteMilestoneAction} id={milestone.id} projectId={projectId} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? <MilestoneCreateForm projectId={projectId} /> : null}
      </section>

      <section id="tasks" className="space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">Tasks</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No tasks yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {tasks.map((task) => (
              <li key={task.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900">{task.title}</p>
                  <p className="text-xs text-zinc-500">
                    {labelize(task.status)} · {task.priority}
                    {task.due_date ? ` · due ${task.due_date}` : ""}
                  </p>
                </div>
                {canWrite ? (
                  <TaskEditForm
                    projectId={projectId}
                    task={task}
                    staff={staff}
                    milestones={milestones}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <TaskCreateForm projectId={projectId} staff={staff} milestones={milestones} />
        ) : null}
      </section>

      <section id="team" className="space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">Team</h2>
        {members.length === 0 ? (
          <p className="text-sm text-zinc-500">No one is assigned yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{member.label}</span>
                {canManageTeam ? (
                  <RemoveMember projectId={projectId} userId={member.userId} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManageTeam ? (
          <AddMember projectId={projectId} staff={availableStaff} />
        ) : (
          <p className="text-sm text-zinc-500">
            Only owners, admins, and project managers can change the team.
          </p>
        )}
      </section>

      <section id="files" className="space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">Files</h2>
        <p className="text-sm text-zinc-500">
          Up to 20 MB. PDF, images, text, CSV, ZIP, DOCX, and XLSX. Client portal access is not active yet.
        </p>
        <FileRows files={files} canWrite={canWrite} />
        {canWrite ? <UploadForm kind="projects" entityId={projectId} /> : null}
      </section>
    </div>
  );
}

function MilestoneCreateForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createMilestoneAction, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action} className="grid gap-3 border border-zinc-200 bg-white p-4 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="status" value="pending" />
      <input name="title" required placeholder="Milestone title" className={fieldClass} />
      <input type="date" name="dueDate" className={fieldClass} />
      <input name="sortOrder" type="number" min={0} defaultValue={0} className={fieldClass} />
      <input name="description" placeholder="Description" className={fieldClass} />
      <ErrorText state={state} />
      <button disabled={pending} className={buttonClass} type="submit">Add milestone</button>
    </form>
  );
}

function StatusButton({
  id,
  projectId,
  nextStatus,
  label,
}: {
  id: string;
  projectId: string;
  nextStatus: "pending" | "completed";
  label: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateMilestoneStatusAction, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="status" value={nextStatus} />
      <button disabled={pending} className={quietButtonClass} type="submit">{label}</button>
    </form>
  );
}

function DeleteButton({
  action,
  id,
  projectId,
}: {
  action: typeof deleteMilestoneAction;
  id: string;
  projectId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={formAction} onSubmit={confirmSubmit("Delete this item? This cannot be undone.")}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="projectId" value={projectId} />
      <button disabled={pending} className={quietButtonClass} type="submit">Delete</button>
      <ErrorText state={state} />
    </form>
  );
}

function TaskCreateForm({
  projectId,
  staff,
  milestones,
}: {
  projectId: string;
  staff: Array<{ userId: string; label: string }>;
  milestones: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createTaskAction, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action} className="grid gap-3 border border-zinc-200 bg-white p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input name="title" required placeholder="Task title" className={fieldClass} />
      <textarea name="description" rows={2} placeholder="Description" className={fieldClass} />
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="status" defaultValue="todo" className={fieldClass}>
          <option value="todo">todo</option>
          <option value="in_progress">in progress</option>
          <option value="done">done</option>
        </select>
        <select name="priority" defaultValue="medium" className={fieldClass}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="urgent">urgent</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
          <input type="checkbox" name="visibleToClient" value="true" />
          Visible to client
        </label>
        <select name="assignedTo" defaultValue="" className={fieldClass}>
          <option value="">Unassigned</option>
          {staff.map((person) => (
            <option key={person.userId} value={person.userId}>{person.label}</option>
          ))}
        </select>
        <select name="milestoneId" defaultValue="" className={fieldClass}>
          <option value="">No milestone</option>
          {milestones.map((milestone) => (
            <option key={milestone.id} value={milestone.id}>{milestone.title}</option>
          ))}
        </select>
        <input type="date" name="dueDate" className={fieldClass} />
      </div>
      <ErrorText state={state} />
      <button disabled={pending} className={buttonClass} type="submit">Add task</button>
    </form>
  );
}

function TaskEditForm({
  projectId,
  task,
  staff,
  milestones,
}: {
  projectId: string;
  task: {
    id: string;
    title: string;
    description: string | null;
    status: "todo" | "in_progress" | "done";
    priority: "low" | "medium" | "high" | "urgent";
    assigned_to: string | null;
    due_date: string | null;
    milestone_id: string | null;
    visible_to_client: boolean;
  };
  staff: Array<{ userId: string; label: string }>;
  milestones: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateTaskAction, initialId);
  const [deleted, deleteAction, deletePending] = useActionState(deleteTaskAction, initialId);
  useEffect(() => {
    if (state?.ok || deleted?.ok) router.refresh();
  }, [deleted, router, state]);

  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="projectId" value={projectId} />
      <input name="title" required defaultValue={task.title} className={fieldClass} />
      <input name="description" defaultValue={task.description ?? ""} className={fieldClass} />
      <select name="status" defaultValue={task.status} className={fieldClass}>
        <option value="todo">todo</option>
        <option value="in_progress">in progress</option>
        <option value="done">done</option>
      </select>
      <select name="priority" defaultValue={task.priority} className={fieldClass}>
        <option value="low">low</option>
        <option value="medium">medium</option>
        <option value="high">high</option>
        <option value="urgent">urgent</option>
      </select>
      <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
        <input type="checkbox" name="visibleToClient" value="true" defaultChecked={task.visible_to_client} />
        Visible to client
      </label>
      <select name="assignedTo" defaultValue={task.assigned_to ?? ""} className={fieldClass}>
        <option value="">Unassigned</option>
        {staff.map((person) => (
          <option key={person.userId} value={person.userId}>{person.label}</option>
        ))}
      </select>
      <select name="milestoneId" defaultValue={task.milestone_id ?? ""} className={fieldClass}>
        <option value="">No milestone</option>
        {milestones.map((milestone) => (
          <option key={milestone.id} value={milestone.id}>{milestone.title}</option>
        ))}
      </select>
      <input type="date" name="dueDate" defaultValue={task.due_date ?? ""} className={fieldClass} />
      <div className="flex gap-2">
        <button disabled={pending} className={buttonClass} type="submit">Save</button>
      </div>
      <ErrorText state={state} />
      <div>
        <button
          disabled={deletePending}
          className={quietButtonClass}
          type="submit"
          formAction={deleteAction}
        >
          Delete task
        </button>
        <ErrorText state={deleted} />
      </div>
    </form>
  );
}

function AddMember({
  projectId,
  staff,
}: {
  projectId: string;
  staff: Array<{ userId: string; label: string }>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addProjectMemberAction, initialProject);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  if (staff.length === 0) {
    return <p className="text-sm text-zinc-500">Every eligible staff member is already assigned.</p>;
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <select name="userId" required className={fieldClass}>
        {staff.map((person) => (
          <option key={person.userId} value={person.userId}>{person.label}</option>
        ))}
      </select>
      <button disabled={pending} className={buttonClass} type="submit">Assign</button>
      <ErrorText state={state} />
    </form>
  );
}

function RemoveMember({ projectId, userId }: { projectId: string; userId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(removeProjectMemberAction, initialProject);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="userId" value={userId} />
      <button disabled={pending} className={quietButtonClass} type="submit">Remove</button>
      <ErrorText state={state} />
    </form>
  );
}

function DeleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteProjectAction, initialId);
  useEffect(() => {
    if (state?.ok) {
      router.push("/dashboard/projects");
      router.refresh();
    }
  }, [router, state]);
  return (
    <form action={action} onSubmit={confirmSubmit("Delete this project and its workspace data that is allowed to be removed?")}>
      <input type="hidden" name="id" value={projectId} />
      <button disabled={pending} className={quietButtonClass} type="submit">Delete project</button>
      <ErrorText state={state} />
    </form>
  );
}

export function UploadForm({
  kind,
  entityId,
}: {
  kind: "projects" | "clients";
  entityId: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(uploadFileAction, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entityId" value={entityId} />
      <input name="file" type="file" required className="text-sm" />
      <button disabled={pending} className={buttonClass} type="submit">
        {pending ? "Uploading…" : "Upload"}
      </button>
      <ErrorText state={state} />
    </form>
  );
}

export function FileRows({
  files,
  canWrite,
}: {
  files: Array<{
    id: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    visible_to_client: boolean;
  }>;
  canWrite: boolean;
}) {
  if (files.length === 0) {
    return <p className="text-sm text-zinc-500">No files yet.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
      {files.map((file) => (
        <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <p className="font-medium text-zinc-900">{file.file_name}</p>
            <p className="text-xs text-zinc-500">
              {file.mime_type ?? "file"}
              {file.size_bytes != null ? ` · ${Math.ceil(file.size_bytes / 1024)} KB` : ""}
              {file.visible_to_client ? " · marked for client later" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadButton id={file.id} />
            {canWrite ? (
              <>
                <VisibilityButton id={file.id} visible={file.visible_to_client} />
                <FileDeleteButton id={file.id} />
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DownloadButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(createFileDownloadAction, initialUrl);
  useEffect(() => {
    if (state?.ok) {
      window.open(state.data.url, "_blank", "noopener,noreferrer");
    }
  }, [state]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className={quietButtonClass} type="submit">Open</button>
      <ErrorText state={state} />
    </form>
  );
}

function VisibilityButton({ id, visible }: { id: string; visible: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setFileVisibilityAction, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="visibleToClient" value={visible ? "false" : "true"} />
      <button disabled={pending} className={quietButtonClass} type="submit">
        {visible ? "Hide from future portal" : "Mark for future portal"}
      </button>
    </form>
  );
}

function FileDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteFileAction, initialId);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);
  return (
    <form action={action} onSubmit={confirmSubmit("Delete this file? This cannot be undone.")}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className={quietButtonClass} type="submit">Delete</button>
      <ErrorText state={state} />
    </form>
  );
}
