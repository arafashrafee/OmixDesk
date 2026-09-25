import { type ReactNode } from "react";
import { BrandMark } from "@/components/brand/brand-mark";

type AuthFormProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AuthShell({ title, subtitle, children }: AuthFormProps) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-10">
        <BrandMark variant="wordmark" priority />
        <p className="mt-3 text-sm text-zinc-600">OmixDesk by Omix Solutions</p>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
