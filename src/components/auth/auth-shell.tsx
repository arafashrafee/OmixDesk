import { type ReactNode } from "react";
import { BrandMark } from "@/components/brand/brand-mark";

type AuthFormProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AuthShell({ title, subtitle, children }: AuthFormProps) {
  return (
    <div className="auth-shell">
      <aside className="auth-intro">
        <h2>A clear view of your agency.</h2>
        <p>Keep your leads, clients, projects and billing together in one workspace.</p>
      </aside>
      <section className="auth-form" aria-label={title}>
      <div className="mb-10">
        <BrandMark variant="wordmark" priority />
        <p className="mt-3 text-sm text-zinc-600">OmixDesk by Omix Solutions</p>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{subtitle}</p>
      </div>
      {children}
      </section>
    </div>
  );
}
