import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ConfirmPage() {
  return (
    <AuthShell
      title="Confirm your email"
      subtitle="We sent a confirmation link. After confirming, you can sign in."
    >
      <Link
        href="/login"
        className="inline-flex bg-[#17356b] px-4 py-2.5 text-sm font-medium text-white"
      >
        Go to sign in
      </Link>
    </AuthShell>
  );
}
