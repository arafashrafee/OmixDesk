"use client";

import { useActionState, useEffect } from "react";
import { portalFileUrlAction, respondToProposalAction } from "@/actions/portal";
import { quietButtonClass } from "@/components/operations/styles";
import type { ActionResult } from "@/lib/errors";

export function PortalDownload({
  files,
}: {
  files: Array<{ id: string; file_name: string; mime_type: string | null; size_bytes: number | null; created_at: string; context_name: string }>;
}) {
  if (files.length === 0) {
    return <p className="empty-state">No shared files.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
      {files.map((file) => (
        <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <p className="font-medium text-zinc-900">{file.file_name}</p>
            <p className="text-xs text-zinc-500">
              {file.context_name} · {file.created_at.slice(0, 10)}
              {file.size_bytes != null ? ` · ${Math.ceil(file.size_bytes / 1024)} KB` : ""}
            </p>
          </div>
          <DownloadButton fileId={file.id} />
        </li>
      ))}
    </ul>
  );
}

function DownloadButton({ fileId }: { fileId: string }) {
  const [state, action, pending] = useActionState(portalFileUrlAction, null as ActionResult<{ url: string }> | null);
  useEffect(() => {
    if (state?.ok) {
      window.open(state.data.url, "_blank", "noopener,noreferrer");
    }
  }, [state]);
  return (
    <form action={action}>
      <input type="hidden" name="fileId" value={fileId} />
      <button disabled={pending} className={quietButtonClass} type="submit">Download</button>
    </form>
  );
}

export function ProposalResponse({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState(
    respondToProposalAction,
    null as ActionResult<{ status: string }> | null,
  );
  return (
    <form action={action} className="space-y-3 border border-zinc-200 bg-white p-4">
      <input type="hidden" name="proposalId" value={proposalId} />
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-zinc-800">Rejection note</span>
        <textarea name="reason" rows={3} className="w-full border border-zinc-300 px-3 py-2" />
      </label>
      {state && !state.ok ? <p className="text-sm text-red-700">{state.error.message}</p> : null}
      <div className="flex gap-2">
        <button name="decision" value="accept" disabled={pending} className="bg-[#17356b] px-3 py-2 text-sm text-white">
          Accept
        </button>
        <button name="decision" value="reject" disabled={pending} className={quietButtonClass}>
          Reject
        </button>
      </div>
    </form>
  );
}
