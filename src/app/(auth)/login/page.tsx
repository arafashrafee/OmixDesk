import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { safeInternalPath } from "@/lib/auth/safe-redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeInternalPath(params.next, "/dashboard");

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your OmixDesk workspace."
    >
      <LoginForm nextPath={nextPath} />
      <p className="mt-6 text-sm text-zinc-600">
        No account?{" "}
        <Link href="/signup" className="font-medium text-zinc-900 underline">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}
