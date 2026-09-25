import { redirect } from "next/navigation";
import { ClientForm } from "@/components/operations/client-form";
import { getAuthContext } from "@/lib/auth/session";
import { canWriteClientRecords } from "@/lib/rbac";

export default async function NewClientPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization || ctx.activeOrganization.role === "client") {
    redirect("/onboarding");
  }
  if (!canWriteClientRecords(ctx.activeOrganization.role)) {
    redirect("/dashboard/clients");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">New client</h1>
      <ClientForm />
    </div>
  );
}
