import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  AcceptInvitationForm,
  CreateOrganizationForm,
} from "@/components/organizations/onboarding-forms";
import { getAuthContext } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/rbac";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login?next=/onboarding");
  }

  const params = await searchParams;
  const inviteToken = params.invite?.trim() ?? "";

  if (ctx.memberships.length > 0 && !inviteToken) {
    const active = ctx.activeOrganization;
    if (active && isStaffRole(active.role)) {
      redirect("/dashboard");
    }
    if (active?.role === "client") {
      redirect("/portal");
    }
  }

  return (
    <main className="min-h-full bg-[#fafafa]">
      <AuthShell
        title="Set up your workspace"
        subtitle="Create an organization or accept an invitation to join one."
      >
        <div className="space-y-10">
          {inviteToken ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Invitation
              </h2>
              <AcceptInvitationForm token={inviteToken} />
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              Create organization
            </h2>
            <CreateOrganizationForm />
          </section>
        </div>
      </AuthShell>
    </main>
  );
}
