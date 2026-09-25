import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-24">
      <p className="text-sm font-medium tracking-[0.14em] text-zinc-500 uppercase">
        OmixDesk
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900">
        Agency operations, organized.
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600">
        Manage leads, clients, projects, proposals and invoices in one shared workspace.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/signup"
          className="rounded-lg bg-[#17356b] px-4 py-2.5 text-sm font-medium text-white"
        >
          Create account
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-900"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
