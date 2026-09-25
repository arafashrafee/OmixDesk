"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInAction } from "@/actions/auth";
import type { ActionResult } from "@/lib/errors";

const initial: ActionResult<{ redirectTo: string }> | null = null;

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(signInAction, initial);

  useEffect(() => {
    if (state?.ok) {
      router.replace(state.data.redirectTo);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
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
        className="w-full bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
