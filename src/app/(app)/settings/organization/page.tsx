import { redirect } from "next/navigation";
import { OrganizationSettingsForm } from "@/components/organizations/organization-settings-form";
import { getAuthContext } from "@/lib/auth/session";
import { getOrganizationDocument } from "@/lib/data/proposals";

export default async function OrganizationSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization) {
    redirect("/onboarding");
  }

  const org = ctx.activeOrganization;
  const document = await getOrganizationDocument(org.organizationId);

  return (
    <OrganizationSettingsForm
      role={org.role}
      name={document?.name ?? org.organizationName}
      timezone={org.timezone}
      defaultCurrency={document?.default_currency ?? org.defaultCurrency}
      email={document?.email ?? ""}
      phone={document?.phone ?? ""}
      address={document?.address ?? ""}
      website={document?.website ?? ""}
    />
  );
}
