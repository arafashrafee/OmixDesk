-- Phase 2: clients, projects, membership, milestones, tasks, files, storage.
-- Does not alter Phase 1 policies. No service role. RLS is authoritative.
--
-- SECURITY DEFINER helpers below exist only so policies can read membership
-- without recursive RLS. They return booleans or parsed path parts, not rows
-- of business data.
--
-- Storage and Postgres are not one transaction. Upload writes the object first,
-- then metadata. If metadata insert fails, the action deletes the object.
-- If that cleanup fails, the leftover object stays inside the caller's
-- organization path and is still denied to other tenants by storage RLS.
-- Deleting a file removes the object first, then the metadata row.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.project_status as enum (
  'planning',
  'active',
  'on_hold',
  'completed',
  'cancelled'
);

create type public.milestone_status as enum (
  'pending',
  'completed'
);

create type public.task_status as enum (
  'todo',
  'in_progress',
  'done'
);

create type public.task_priority as enum (
  'low',
  'medium',
  'high',
  'urgent'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  company text,
  email text,
  phone text,
  address text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_name_nonempty check (length(trim(name)) > 0),
  constraint clients_org_id_key unique (organization_id, id)
);

create index clients_organization_id_idx on public.clients (organization_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  name text not null,
  description text,
  status public.project_status not null default 'planning',
  start_date date,
  deadline date,
  budget numeric(14, 2),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_nonempty check (length(trim(name)) > 0),
  constraint projects_budget_nonnegative check (budget is null or budget >= 0),
  constraint projects_org_id_key unique (organization_id, id),
  constraint projects_client_same_org
    foreign key (organization_id, client_id)
    references public.clients (organization_id, id)
    on delete restrict
);

create index projects_organization_id_idx on public.projects (organization_id);
create index projects_org_client_idx on public.projects (organization_id, client_id);
create index projects_org_status_idx on public.projects (organization_id, status);

create table public.project_members (
  project_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  constraint project_members_project_same_org
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id)
    on delete cascade,
  constraint project_members_user_same_org
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id)
    on delete cascade
);

create index project_members_org_user_idx
  on public.project_members (organization_id, user_id);
create index project_members_org_project_idx
  on public.project_members (organization_id, project_id);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  title text not null,
  description text,
  status public.milestone_status not null default 'pending',
  due_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestones_title_nonempty check (length(trim(title)) > 0),
  constraint milestones_sort_order_nonnegative check (sort_order >= 0),
  constraint milestones_org_project_id_key unique (organization_id, project_id, id),
  constraint milestones_project_same_org
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id)
    on delete cascade
);

create index milestones_org_project_idx
  on public.milestones (organization_id, project_id, sort_order);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  milestone_id uuid,
  title text not null,
  description text,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  assigned_to uuid,
  due_date date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_nonempty check (length(trim(title)) > 0),
  constraint tasks_project_same_org
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id)
    on delete cascade,
  constraint tasks_milestone_same_project
    foreign key (organization_id, project_id, milestone_id)
    references public.milestones (organization_id, project_id, id)
    on delete set null,
  constraint tasks_assignee_same_org
    foreign key (organization_id, assigned_to)
    references public.organization_members (organization_id, user_id)
    on delete set null
);

create index tasks_org_project_status_idx
  on public.tasks (organization_id, project_id, status);
create index tasks_assigned_to_idx on public.tasks (assigned_to);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles (id) on delete set null,
  visible_to_client boolean not null default false,
  project_id uuid,
  client_id uuid,
  created_at timestamptz not null default now(),
  constraint files_storage_path_unique unique (storage_path),
  constraint files_name_nonempty check (length(trim(file_name)) > 0),
  constraint files_size_nonnegative check (size_bytes is null or size_bytes >= 0),
  constraint files_one_owner check (
    ((project_id is not null)::int + (client_id is not null)::int) = 1
  ),
  constraint files_project_same_org
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id)
    on delete cascade,
  constraint files_client_same_org
    foreign key (organization_id, client_id)
    references public.clients (organization_id, id)
    on delete cascade
);

create index files_org_project_idx on public.files (organization_id, project_id);
create index files_org_client_idx on public.files (organization_id, client_id);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger milestones_set_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Narrow SECURITY DEFINER checks
-- ---------------------------------------------------------------------------

create or replace function public.prevent_organization_id_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.organization_id is distinct from old.organization_id then
    raise exception 'Cannot move records across organizations'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_actor_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if to_jsonb(new) ? 'created_by'
     and (to_jsonb(new) ->> 'created_by') is distinct from (to_jsonb(old) ->> 'created_by')
     and (to_jsonb(new) ->> 'created_by') is not null then
    raise exception 'Cannot reassign created_by' using errcode = '42501';
  end if;

  if to_jsonb(new) ? 'uploaded_by'
     and (to_jsonb(new) ->> 'uploaded_by') is distinct from (to_jsonb(old) ->> 'uploaded_by')
     and (to_jsonb(new) ->> 'uploaded_by') is not null then
    raise exception 'Cannot reassign uploaded_by' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Justified DEFINER: membership role must be checked even if a later policy
-- hides the target membership row from the caller.
create or replace function public.enforce_project_member_is_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.org_role;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.project_id is distinct from old.project_id
       or new.user_id is distinct from old.user_id then
      raise exception 'Cannot reassign project membership'
        using errcode = '42501';
    end if;
  end if;

  select m.role into v_role
  from public.organization_members as m
  where m.organization_id = new.organization_id
    and m.user_id = new.user_id;

  if v_role is null or v_role = 'client'::public.org_role then
    raise exception 'Project members must be staff in this organization'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_task_assignee_is_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.org_role;
begin
  if new.assigned_to is null then
    return new;
  end if;

  select m.role into v_role
  from public.organization_members as m
  where m.organization_id = new.organization_id
    and m.user_id = new.assigned_to;

  if v_role is null or v_role = 'client'::public.org_role then
    raise exception 'Tasks can only be assigned to staff in this organization'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.can_write_client_records(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    p_organization_id,
    array[
      'owner'::public.org_role,
      'admin'::public.org_role,
      'project_manager'::public.org_role
    ]
  );
$$;

create or replace function public.can_write_project(
  p_organization_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_org_role(
      p_organization_id,
      array[
        'owner'::public.org_role,
        'admin'::public.org_role,
        'project_manager'::public.org_role
      ]
    )
    or (
      public.org_role(p_organization_id) = 'member'::public.org_role
      and exists (
        select 1
        from public.project_members as pm
        where pm.organization_id = p_organization_id
          and pm.project_id = p_project_id
          and pm.user_id = auth.uid()
      )
    );
$$;

create or replace function public.can_delete_project(
  p_organization_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Project deletion is limited to owner/admin/project manager.
  -- Assignment does not grant a member the right to delete the project.
  select
    p_project_id is not null
    and public.can_write_client_records(p_organization_id);
$$;

create or replace function public.omixdesk_storage_target(p_object_name text)
returns table (
  organization_id uuid,
  kind text,
  entity_id uuid
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  parts text[];
begin
  if p_object_name is null
     or p_object_name like '%..%'
     or strpos(p_object_name, chr(92)) > 0 then
    return;
  end if;

  parts := string_to_array(p_object_name, '/');
  if cardinality(parts) <> 4 then
    return;
  end if;

  if parts[2] not in ('projects', 'clients') then
    return;
  end if;

  if parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;

  if parts[4] is null or length(parts[4]) = 0 then
    return;
  end if;

  organization_id := parts[1]::uuid;
  kind := parts[2];
  entity_id := parts[3]::uuid;
  return next;
end;
$$;

create or replace function public.can_read_omixdesk_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.omixdesk_storage_target(p_object_name) as target
    where public.is_staff(target.organization_id)
  );
$$;

create or replace function public.can_write_omixdesk_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.omixdesk_storage_target(p_object_name) as target
    where (
      target.kind = 'projects'
      and public.can_write_project(target.organization_id, target.entity_id)
    )
    or (
      target.kind = 'clients'
      and public.can_write_client_records(target.organization_id)
    )
  );
$$;

create or replace function public.enforce_file_path()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org uuid;
  v_kind text;
  v_entity uuid;
begin
  select target.organization_id, target.kind, target.entity_id
    into v_org, v_kind, v_entity
  from public.omixdesk_storage_target(new.storage_path) as target;

  if v_org is null or v_org is distinct from new.organization_id then
    raise exception 'Storage path does not match the organization'
      using errcode = '42501';
  end if;

  if new.project_id is not null then
    if v_kind <> 'projects' or v_entity is distinct from new.project_id then
      raise exception 'Storage path does not match the project'
        using errcode = '42501';
    end if;
  elsif new.client_id is not null then
    if v_kind <> 'clients' or v_entity is distinct from new.client_id then
      raise exception 'Storage path does not match the client'
        using errcode = '42501';
    end if;
  else
    raise exception 'File must belong to a project or a client'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.storage_path is distinct from old.storage_path
       or new.project_id is distinct from old.project_id
       or new.client_id is distinct from old.client_id
       or new.file_name is distinct from old.file_name
       or new.mime_type is distinct from old.mime_type
       or new.size_bytes is distinct from old.size_bytes then
      raise exception 'File ownership and storage identity are immutable'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger clients_protect_tenant
  before update on public.clients
  for each row execute function public.prevent_organization_id_change();
create trigger clients_protect_actor
  before update on public.clients
  for each row execute function public.prevent_actor_reassignment();

create trigger projects_protect_tenant
  before update on public.projects
  for each row execute function public.prevent_organization_id_change();
create trigger projects_protect_actor
  before update on public.projects
  for each row execute function public.prevent_actor_reassignment();

create trigger project_members_staff_only
  before insert or update on public.project_members
  for each row execute function public.enforce_project_member_is_staff();

create trigger milestones_protect_tenant
  before update on public.milestones
  for each row execute function public.prevent_organization_id_change();

create trigger tasks_protect_tenant
  before update on public.tasks
  for each row execute function public.prevent_organization_id_change();
create trigger tasks_protect_actor
  before update on public.tasks
  for each row execute function public.prevent_actor_reassignment();
create trigger tasks_assignee_staff
  before insert or update on public.tasks
  for each row execute function public.enforce_task_assignee_is_staff();

create trigger files_protect_tenant
  before update on public.files
  for each row execute function public.prevent_organization_id_change();
create trigger files_protect_actor
  before update on public.files
  for each row execute function public.prevent_actor_reassignment();
create trigger files_enforce_path
  before insert or update on public.files
  for each row execute function public.enforce_file_path();

revoke all on function public.prevent_organization_id_change() from public, anon;
revoke all on function public.prevent_actor_reassignment() from public, anon;
revoke all on function public.enforce_project_member_is_staff() from public, anon;
revoke all on function public.enforce_task_assignee_is_staff() from public, anon;
revoke all on function public.enforce_file_path() from public, anon;

-- Authenticated needs EXECUTE so row triggers can run. These functions raise
-- or return NEW; they do not read business data back to the caller.
grant execute on function public.prevent_organization_id_change() to authenticated;
grant execute on function public.prevent_actor_reassignment() to authenticated;
grant execute on function public.enforce_project_member_is_staff() to authenticated;
grant execute on function public.enforce_task_assignee_is_staff() to authenticated;
grant execute on function public.enforce_file_path() to authenticated;

revoke all on function public.can_write_client_records(uuid) from public;
revoke all on function public.can_write_project(uuid, uuid) from public;
revoke all on function public.can_delete_project(uuid, uuid) from public;
revoke all on function public.omixdesk_storage_target(text) from public;
revoke all on function public.can_read_omixdesk_object(text) from public;
revoke all on function public.can_write_omixdesk_object(text) from public;

grant execute on function public.can_write_client_records(uuid) to authenticated;
grant execute on function public.can_write_project(uuid, uuid) to authenticated;
grant execute on function public.can_delete_project(uuid, uuid) to authenticated;
grant execute on function public.omixdesk_storage_target(text) to authenticated;
grant execute on function public.can_read_omixdesk_object(text) to authenticated;
grant execute on function public.can_write_omixdesk_object(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------

revoke all on table public.clients from public, anon;
revoke all on table public.projects from public, anon;
revoke all on table public.project_members from public, anon;
revoke all on table public.milestones from public, anon;
revoke all on table public.tasks from public, anon;
revoke all on table public.files from public, anon;

grant select, insert, update, delete on table public.clients to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, delete on table public.project_members to authenticated;
grant select, insert, update, delete on table public.milestones to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select, insert, update, delete on table public.files to authenticated;

alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.files enable row level security;

alter table public.clients force row level security;
alter table public.projects force row level security;
alter table public.project_members force row level security;
alter table public.milestones force row level security;
alter table public.tasks force row level security;
alter table public.files force row level security;

-- Clients: staff read. Writes are owner/admin/project manager.
create policy clients_select_staff
  on public.clients
  for select
  to authenticated
  using (public.is_staff(organization_id));

create policy clients_insert_managers
  on public.clients
  for insert
  to authenticated
  with check (
    public.can_write_client_records(organization_id)
    and created_by = auth.uid()
  );

create policy clients_update_managers
  on public.clients
  for update
  to authenticated
  using (public.can_write_client_records(organization_id))
  with check (public.can_write_client_records(organization_id));

create policy clients_delete_managers
  on public.clients
  for delete
  to authenticated
  using (public.can_write_client_records(organization_id));

-- Projects: staff read. Members write only when assigned. Delete is manager-only.
create policy projects_select_staff
  on public.projects
  for select
  to authenticated
  using (public.is_staff(organization_id));

create policy projects_insert_managers
  on public.projects
  for insert
  to authenticated
  with check (
    public.can_write_client_records(organization_id)
    and created_by = auth.uid()
  );

create policy projects_update_writers
  on public.projects
  for update
  to authenticated
  using (public.can_write_project(organization_id, id))
  with check (public.can_write_project(organization_id, id));

create policy projects_delete_managers
  on public.projects
  for delete
  to authenticated
  using (public.can_delete_project(organization_id, id));

-- Project roster: staff can read. Only owner/admin/project manager can change it.
create policy project_members_select_staff
  on public.project_members
  for select
  to authenticated
  using (public.is_staff(organization_id));

create policy project_members_insert_managers
  on public.project_members
  for insert
  to authenticated
  with check (public.can_write_client_records(organization_id));

create policy project_members_delete_managers
  on public.project_members
  for delete
  to authenticated
  using (public.can_write_client_records(organization_id));

-- Milestones and tasks follow project write rules.
create policy milestones_select_staff
  on public.milestones
  for select
  to authenticated
  using (public.is_staff(organization_id));

create policy milestones_insert_writers
  on public.milestones
  for insert
  to authenticated
  with check (public.can_write_project(organization_id, project_id));

create policy milestones_update_writers
  on public.milestones
  for update
  to authenticated
  using (public.can_write_project(organization_id, project_id))
  with check (public.can_write_project(organization_id, project_id));

create policy milestones_delete_writers
  on public.milestones
  for delete
  to authenticated
  using (public.can_write_project(organization_id, project_id));

create policy tasks_select_staff
  on public.tasks
  for select
  to authenticated
  using (public.is_staff(organization_id));

create policy tasks_insert_writers
  on public.tasks
  for insert
  to authenticated
  with check (
    public.can_write_project(organization_id, project_id)
    and created_by = auth.uid()
  );

create policy tasks_update_writers
  on public.tasks
  for update
  to authenticated
  using (public.can_write_project(organization_id, project_id))
  with check (public.can_write_project(organization_id, project_id));

create policy tasks_delete_writers
  on public.tasks
  for delete
  to authenticated
  using (public.can_write_project(organization_id, project_id));

-- Files: staff read. Project files follow project writes. Client files follow client writes.
create policy files_select_staff
  on public.files
  for select
  to authenticated
  using (public.is_staff(organization_id));

create policy files_insert_writers
  on public.files
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      (
        project_id is not null
        and client_id is null
        and public.can_write_project(organization_id, project_id)
      )
      or (
        client_id is not null
        and project_id is null
        and public.can_write_client_records(organization_id)
      )
    )
  );

create policy files_update_visibility
  on public.files
  for update
  to authenticated
  using (
    (
      project_id is not null
      and public.can_write_project(organization_id, project_id)
    )
    or (
      client_id is not null
      and public.can_write_client_records(organization_id)
    )
  )
  with check (
    (
      project_id is not null
      and public.can_write_project(organization_id, project_id)
    )
    or (
      client_id is not null
      and public.can_write_client_records(organization_id)
    )
  );

create policy files_delete_writers
  on public.files
  for delete
  to authenticated
  using (
    (
      project_id is not null
      and public.can_write_project(organization_id, project_id)
    )
    or (
      client_id is not null
      and public.can_write_client_records(organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Private storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'omixdesk-files',
  'omixdesk-files',
  false,
  20971520,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy omixdesk_files_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'omixdesk-files'
    and public.can_read_omixdesk_object(name)
  );

create policy omixdesk_files_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'omixdesk-files'
    and public.can_write_omixdesk_object(name)
  );

create policy omixdesk_files_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'omixdesk-files'
    and public.can_write_omixdesk_object(name)
  );
