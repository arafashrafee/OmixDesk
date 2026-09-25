import { redirect } from "next/navigation";
import { PortalDownload } from "@/components/portal/portal-download";
import { getAuthContext } from "@/lib/auth/session";
import { loadPortalFiles } from "@/lib/data/portal";

export default async function PortalFilesPage() {
  const ctx = await getAuthContext();
  if (!ctx?.activeOrganization) redirect("/login?next=/portal/files");
  const files = await loadPortalFiles(ctx.activeOrganization.organizationId);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">Files</h1>
      <PortalDownload files={files} />
    </div>
  );
}
