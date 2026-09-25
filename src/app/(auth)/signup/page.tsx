import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthShell
      title="Create account"
      subtitle="Start with email and password. Confirm your email to continue."
    >
      <SignupForm />
      <p className="mt-6 text-sm text-zinc-600">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
