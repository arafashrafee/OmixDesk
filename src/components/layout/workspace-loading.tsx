export function WorkspaceLoading() {
  return <div role="status" aria-live="polite" className="space-y-6"><p className="text-sm text-zinc-600">Loading workspace…</p><div aria-hidden="true" className="space-y-5"><div className="h-8 w-48 rounded-lg bg-slate-200" /><div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((key) => <div key={key} className="h-28 rounded-2xl border border-zinc-200 bg-white" />)}</div><div className="h-64 rounded-2xl border border-zinc-200 bg-white" /></div></div>;
}
