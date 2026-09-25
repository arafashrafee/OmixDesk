-- Phase 3: CRM leads and lead activities.
-- Does not alter Phase 1 or Phase 2 policies. No service role.
--
-- Status rules:
-- - Open stages: new, contacted, qualified, proposal. Staff may move between them.
-- - lost requires lost_reason. Only owner/admin/project manager may set or reopen lost.
-- - won requires converted_client_id and is set only inside convert_lead_to_client.
-- - A normal update cannot mark a lead won or attach a client.
--
-- convert_lead_to_client is SECURITY DEFINER because it inserts a client and
-- updates the lead in one transaction. It checks auth.uid() and manager role,
-- locks the lead row in the supplied organization, and returns the existing
-- client id if that lead is already converted.
--
-- authenticated has no UPDATE privilege on converted_client_id. A normal
-- update therefore cannot satisfy the won-with-client check, even if a raw
-- SQL session sets omixdesk.converting_lead. The conversion function runs as
-- its owner and is the only path that writes that column. The transaction-local
-- flag is an additional guard inside that function, not the privilege boundary.

create type public.lead_status as enum (
  'new',
  'contacted',
  'qualified',
  'proposal',
  'won',
  'lost'
);

create type public.lead_priority as enum (
  'low',
  'medium',
  'high'
);

create type public.lead_activity_type as enum (
  'note',
  'call',
  'email',
  'meeting',
  'status_change',
  'follow_up'
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  company text,
  email text,
  phone text,
  source text,
  service_interest text,
  estimated_value numeric(14, 2),
  status public.lead_status not null default 'new',
  priority public.lead_priority not null default 'medium',
  assigned_to uuid,
  next_follow_up_at timestamptz,
  notes text,
  lost_reason text,
  converted_client_id uuid,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_name_nonempty check (length(trim(name)) > 0),
  constraint leads_estimated_value_nonnegative check (
    estimated_value is null or estimated_value >= 0
  ),
  constraint leads_org_id_key unique (organization_id, id),
  constraint leads_assignee_same_org
    foreign key (organization_id, assigned_to)
    references public.organization_members (organization_id, user_id)
    on delete set null,
  constraint leads_client_same_org
    foreign key (organization_id, converted_client_id)
    references public.clients (organization_id, id)
    on delete restrict,
  constraint leads_won_has_client check (
    (status = 'won' and converted_client_id is not null)
    or (status <> 'won' and converted_client_id is null)
  ),
  constraint leads_lost_reason_consistent check (
    (
      status = 'lost'
      and lost_reason is not null
      and length(trim(lost_reason)) > 0
    )
    or (status <> 'lost' and lost_reason is null)
  )
);

create index leads_org_status_idx on public.leads (organization_id, status);
create index leads_org_assigned_idx on public.leads (organization_id, assigned_to);
create index leads_org_follow_up_idx on public.leads (organization_id, next_follow_up_at);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid not null,
  activity_type public.lead_activity_type not null,
  content text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint lead_activities_content_nonempty check (length(trim(content)) > 0),
  constraint lead_activities_lead_same_org
    foreign key (organization_id, lead_id)
    references public.leads (organization_id, id)
    on delete cascade
);

create index lead_activities_lead_idx
  on public.lead_activities (organization_id, lead_id, created_at);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger leads_protect_tenant
  before update on public.leads
  for each row execute function public.prevent_organization_id_change();

create trigger leads_protect_actor
  before update on public.leads
  for each row execute function public.prevent_actor_reassignment();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_leads(p_organization_id uuid)
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

create or replace function public.can_update_lead(
  p_organization_id uuid,
  p_assigned_to uuid,
  p_status public.lead_status
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_leads(p_organization_id)
    or (
      public.org_role(p_organization_id) = 'member'::public.org_role
      and p_assigned_to = auth.uid()
      and p_status in (
        'new'::public.lead_status,
        'contacted'::public.lead_status,
        'qualified'::public.lead_status,
        'proposal'::public.lead_status
      )
    );
$$;

create or replace function public.enforce_lead_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee_role public.org_role;
  v_converting boolean;
begin
  v_converting := coalesce(current_setting('omixdesk.converting_lead', true), '') = 'on';

  if new.assigned_to is not null then
    select m.role into v_assignee_role
    from public.organization_members as m
    where m.organization_id = new.organization_id
      and m.user_id = new.assigned_to;

    if v_assignee_role is null or v_assignee_role = 'client'::public.org_role then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
  end if;

  if not public.can_manage_leads(new.organization_id) then
    if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;

    if tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;

    if tg_op = 'INSERT' and new.status in ('won'::public.lead_status, 'lost'::public.lead_status) then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;

    if tg_op = 'UPDATE'
       and new.status in ('won'::public.lead_status, 'lost'::public.lead_status)
       and old.status is distinct from new.status then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'won'::public.lead_status and not v_converting then
    if tg_op = 'INSERT' then
      raise exception 'You do not have access.' using errcode = '42501';
    elsif old.status is distinct from 'won'::public.lead_status then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'won'::public.lead_status
     and new.status is distinct from 'won'::public.lead_status then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if new.converted_client_id is not null and not v_converting then
    if tg_op = 'INSERT' then
      raise exception 'You do not have access.' using errcode = '42501';
    elsif new.converted_client_id is distinct from old.converted_client_id then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger leads_enforce_rules
  before insert or update on public.leads
  for each row execute function public.enforce_lead_rules();

create or replace function public.log_lead_activity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_assignee text;
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (
      organization_id, lead_id, activity_type, content, created_by
    )
    values (
      new.organization_id,
      new.id,
      'note'::public.lead_activity_type,
      'Lead created.',
      auth.uid()
    );
    return new;
  end if;

  if new.status is distinct from old.status
     and not (
       coalesce(current_setting('omixdesk.converting_lead', true), '') = 'on'
       and new.status = 'won'::public.lead_status
     ) then
    insert into public.lead_activities (
      organization_id, lead_id, activity_type, content, created_by
    )
    values (
      new.organization_id,
      new.id,
      'status_change'::public.lead_activity_type,
      'Status changed from ' || replace(old.status::text, '_', ' ')
        || ' to ' || replace(new.status::text, '_', ' ') || '.',
      auth.uid()
    );
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is null then
      v_assignee := 'unassigned';
    else
      select coalesce(nullif(trim(p.full_name), ''), p.email, 'a staff member')
        into v_assignee
      from public.profiles as p
      where p.id = new.assigned_to;
      v_assignee := coalesce(v_assignee, 'a staff member');
    end if;

    insert into public.lead_activities (
      organization_id, lead_id, activity_type, content, created_by
    )
    values (
      new.organization_id,
      new.id,
      'note'::public.lead_activity_type,
      'Assignment updated to ' || v_assignee || '.',
      auth.uid()
    );
  end if;

  return new;
end;
$$;

create trigger leads_log_activity
  after insert or update on public.leads
  for each row execute function public.log_lead_activity();

-- ---------------------------------------------------------------------------
-- Atomic conversion
-- ---------------------------------------------------------------------------

create or replace function public.convert_lead_to_client(
  p_organization_id uuid,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lead public.leads;
  v_client_id uuid;
  v_notes text;
begin
  if v_user_id is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if p_organization_id is null or p_lead_id is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if not public.can_manage_leads(p_organization_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if v_lead.converted_client_id is not null then
    return v_lead.converted_client_id;
  end if;

  v_notes := nullif(
    trim(
      concat_ws(
        E'\n\n',
        nullif(trim(coalesce(v_lead.notes, '')), ''),
        case
          when nullif(trim(coalesce(v_lead.service_interest, '')), '') is not null
            then 'Service interest: ' || trim(v_lead.service_interest)
          else null
        end
      )
    ),
    ''
  );

  perform set_config('omixdesk.converting_lead', 'on', true);

  insert into public.clients (
    organization_id,
    name,
    company,
    email,
    phone,
    notes,
    created_by
  )
  values (
    v_lead.organization_id,
    trim(v_lead.name),
    v_lead.company,
    v_lead.email,
    v_lead.phone,
    v_notes,
    v_user_id
  )
  returning id into v_client_id;

  update public.leads
  set status = 'won'::public.lead_status,
      converted_client_id = v_client_id,
      lost_reason = null
  where id = v_lead.id
    and organization_id = v_lead.organization_id
    and converted_client_id is null;

  if not found then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  insert into public.lead_activities (
    organization_id,
    lead_id,
    activity_type,
    content,
    created_by
  )
  values (
    v_lead.organization_id,
    v_lead.id,
    'status_change'::public.lead_activity_type,
    'Converted to a client.',
    v_user_id
  );

  perform set_config('omixdesk.converting_lead', 'off', true);
  return v_client_id;
end;
$$;

revoke all on function public.can_manage_leads(uuid) from public, anon;
revoke all on function public.can_update_lead(uuid, uuid, public.lead_status) from public, anon;
revoke all on function public.enforce_lead_rules() from public, anon;
revoke all on function public.log_lead_activity() from public, anon;
revoke all on function public.convert_lead_to_client(uuid, uuid) from public, anon;

grant execute on function public.can_manage_leads(uuid) to authenticated;
grant execute on function public.can_update_lead(uuid, uuid, public.lead_status) to authenticated;
grant execute on function public.enforce_lead_rules() to authenticated;
grant execute on function public.log_lead_activity() to authenticated;
grant execute on function public.convert_lead_to_client(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------

revoke all on table public.leads from public, anon;
revoke all on table public.lead_activities from public, anon;

grant select, delete on table public.leads to authenticated;
-- converted_client_id, id, organization_id, created_by, and timestamps are
-- not writable by authenticated. Won status needs converted_client_id, so an
-- ordinary update cannot mark a lead won. created_at/updated_at stay on defaults
-- and the updated_at trigger.
grant insert (
  organization_id,
  name,
  company,
  email,
  phone,
  source,
  service_interest,
  estimated_value,
  status,
  priority,
  assigned_to,
  next_follow_up_at,
  notes,
  lost_reason,
  created_by
) on table public.leads to authenticated;
grant update (
  name,
  company,
  email,
  phone,
  source,
  service_interest,
  estimated_value,
  status,
  priority,
  assigned_to,
  next_follow_up_at,
  notes,
  lost_reason
) on table public.leads to authenticated;
grant select, insert on table public.lead_activities to authenticated;

alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.leads force row level security;
alter table public.lead_activities force row level security;

create policy leads_select_staff
  on public.leads
  for select
  to authenticated
  using (public.is_staff(organization_id));

create policy leads_insert_staff
  on public.leads
  for insert
  to authenticated
  with check (
    public.is_staff(organization_id)
    and created_by = auth.uid()
    and status <> 'won'::public.lead_status
    and converted_client_id is null
    and (
      public.can_manage_leads(organization_id)
      or (
        public.org_role(organization_id) = 'member'::public.org_role
        and (assigned_to is null or assigned_to = auth.uid())
        and status in (
          'new'::public.lead_status,
          'contacted'::public.lead_status,
          'qualified'::public.lead_status,
          'proposal'::public.lead_status
        )
      )
    )
  );

create policy leads_update_authorized
  on public.leads
  for update
  to authenticated
  using (public.can_update_lead(organization_id, assigned_to, status))
  with check (public.can_update_lead(organization_id, assigned_to, status));

create policy leads_delete_managers
  on public.leads
  for delete
  to authenticated
  using (public.can_manage_leads(organization_id));

create policy lead_activities_select_staff
  on public.lead_activities
  for select
  to authenticated
  using (public.is_staff(organization_id));

create policy lead_activities_insert_staff
  on public.lead_activities
  for insert
  to authenticated
  with check (
    public.is_staff(organization_id)
    and created_by = auth.uid()
  );
