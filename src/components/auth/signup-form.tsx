"use client";

import { useActionState } from "react";
import { signUpAction } from "@/actions/auth";
import type { ActionResult } from "@/lib/errors";

const initial: ActionResult<{ message: string }> | null = null;

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initial);

  if (state?.ok) {
    return (
      <p className="border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">
        {state.data.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Full name</span>
        <input
          name="fullName"
          type="text"
          autoComplete="name"
          required
          className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        />
      </label>
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
          autoComplete="new-password"
          required
          minLength={8}
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
        className="w-full bg-[#17356b] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
