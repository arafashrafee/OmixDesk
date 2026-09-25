import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/rbac";

/**
 * Staff queries include internal fields such as client notes and project budget.
 * The client portal must not reuse these selects.
 */

export async function listClients(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, company, email, phone, updated_at")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error || !data) {
    return { ok: false as const, rows: [] };
  }
  return { ok: true as const, rows: data };
}

export async function getClient(organizationId: string, clientId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, organization_id, name, company, email, phone, address, notes, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("id", clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

export async function listProjects(organizationId: string) {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, client_id, name, status, deadline, budget, updated_at")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (error || !projects) {
    return { ok: false as const, rows: [] };
  }

  const clientIds = [...new Set(projects.map((row) => row.client_id))];
  const names = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", organizationId)
      .in("id", clientIds);
    for (const client of clients ?? []) {
      names.set(client.id, client.name);
    }
  }

  const projectIds = projects.map((row) => row.id);
  const progress = new Map<string, Array<"pending" | "completed">>();
  if (projectIds.length > 0) {
    const { data: milestones } = await supabase
      .from("milestones")
      .select("project_id, status")
      .eq("organization_id", organizationId)
      .in("project_id", projectIds);
    for (const milestone of milestones ?? []) {
      const current = progress.get(milestone.project_id) ?? [];
      current.push(milestone.status);
      progress.set(milestone.project_id, current);
    }
  }

  return {
    ok: true as const,
    rows: projects.map((row) => ({
      ...row,
      clientName: names.get(row.client_id) ?? "Client",
      milestoneStatuses: progress.get(row.id) ?? [],
    })),
  };
}

export async function getProject(organizationId: string, projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, organization_id, client_id, name, description, status, start_date, deadline, budget, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

export async function listClientOptions(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error || !data) {
    return [];
  }
  return data;
}

export type StaffOption = {
  userId: string;
  role: OrgRole;
  label: string;
};

export async function listStaffOptions(
  organizationId: string,
): Promise<StaffOption[]> {
  const supabase = await createClient();
  const { data: members, error } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId);

  if (error || !members) {
    return [];
  }

  const staff = members.filter((member) => member.role !== "client");
  if (staff.length === 0) {
    return [];
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      staff.map((member) => member.user_id),
    );

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return staff.map((member) => {
    const profile = profileById.get(member.user_id);
    const label = profile?.full_name?.trim() || profile?.email || member.user_id;
    return { userId: member.user_id, role: member.role, label };
  });
}

export async function listProjectMembers(
  organizationId: string,
  projectId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id, created_at")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);

  if (error || !data) {
    return [];
  }
  return data;
}

export async function listMilestones(organizationId: string, projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("milestones")
    .select("id, title, description, status, due_date, sort_order")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data;
}

export async function listTasks(organizationId: string, projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, description, status, priority, assigned_to, due_date, milestone_id, visible_to_client",
    )
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data;
}

export async function listFilesForProject(
  organizationId: string,
  projectId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("files")
    .select("id, file_name, mime_type, size_bytes, visible_to_client, created_at")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }
  return data;
}

export async function listFilesForClient(
  organizationId: string,
  clientId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("files")
    .select("id, file_name, mime_type, size_bytes, visible_to_client, created_at")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }
  return data;
}

export async function listProjectsForClient(
  organizationId: string,
  clientId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, status, deadline")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .order("name", { ascending: true });

  if (error || !data) {
    return [];
  }
  return data;
}
