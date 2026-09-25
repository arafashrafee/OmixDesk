-- Phase 5: client portal mapping, invitations, visibility, and safe reads.
-- Staff policies from earlier migrations stay in place.
-- Clients do not get SELECT on operational tables. Both staff and clients share
-- the authenticated role, so a client SELECT policy would also expose budget,
-- assignees, and internal notes. Portal functions return explicit columns.

alter table public.tasks
  add column visible_to_client boolean not null default false;

alter table public.proposals
  add column client_response_note text;

alter table public.proposals
  add constraint proposals_client_response_note_len
  check (client_response_note is null or char_length(client_response_note) <= 500);

alter table public.invitations
  drop constraint invitations_staff_roles_only;

alter table public.invitations
  add column client_id uuid;

alter table public.invitations
  add constraint invitations_role_target check (
    (
      role = 'client'::public.org_role
      and client_id is not null
    )
    or (
      role in (
        'admin'::public.org_role,
        'project_manager'::public.org_role,
        'member'::public.org_role
      )
      and client_id is null
    )
  );

alter table public.invitations
  add constraint invitations_client_same_org
  foreign key (organization_id, client_id)
  references public.clients (organization_id, id)
  on delete cascade;

create table public.client_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  user_id uuid not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint client_users_unique unique (organization_id, client_id, user_id),
  constraint client_users_client_same_org
    foreign key (organization_id, client_id)
    references public.clients (organization_id, id)
    on delete cascade,
  constraint client_users_member_same_org
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id)
    on delete cascade
);

create index client_users_user_idx on public.client_users (user_id);
create index client_users_client_idx on public.client_users (organization_id, client_id);

create or replace function public.enforce_client_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.org_role;
begin
  select m.role into v_role
  from public.organization_members as m
  where m.organization_id = new.organization_id
    and m.user_id = new.user_id;

  if v_role is distinct from 'client'::public.org_role then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger client_users_require_client_role
  before insert or update on public.client_users
  for each row execute function public.enforce_client_user_role();

create or replace function public.client_mapped_to(
  p_organization_id uuid,
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.client_users as link
      where link.organization_id = p_organization_id
        and link.client_id = p_client_id
        and link.user_id = auth.uid()
    );
$$;

create or replace function public.client_can_access_project(
  p_organization_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects as project
    where project.organization_id = p_organization_id
      and project.id = p_project_id
      and public.client_mapped_to(project.organization_id, project.client_id)
  );
$$;

create or replace function public.client_can_access_file(
  p_organization_id uuid,
  p_project_id uuid,
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_project_id is not null then public.client_can_access_project(p_organization_id, p_project_id)
    when p_client_id is not null then public.client_mapped_to(p_organization_id, p_client_id)
    else false
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
  )
  or exists (
    select 1
    from public.files as file
    where file.storage_path = p_object_name
      and file.visible_to_client = true
      and public.client_can_access_file(file.organization_id, file.project_id, file.client_id)
  );
$$;

create or replace function public.client_can_read_proposal(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.proposals as proposal
    left join public.leads as lead
      on lead.id = proposal.lead_id
     and lead.organization_id = proposal.organization_id
    where proposal.id = p_proposal_id
      and proposal.status in (
        'sent'::public.proposal_status,
        'accepted'::public.proposal_status,
        'rejected'::public.proposal_status,
        'expired'::public.proposal_status
      )
      and (
        (
          proposal.client_id is not null
          and public.client_mapped_to(proposal.organization_id, proposal.client_id)
        )
        or (
          proposal.lead_id is not null
          and lead.converted_client_id is not null
          and public.client_mapped_to(proposal.organization_id, lead.converted_client_id)
        )
      )
  );
$$;

create or replace function public.portal_projects(p_organization_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  status public.project_status,
  deadline date,
  milestone_total integer,
  milestone_completed integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    project.id,
    project.name,
    project.description,
    project.status,
    project.deadline,
    coalesce(counts.total_count, 0)::integer,
    coalesce(counts.completed_count, 0)::integer
  from public.projects as project
  left join lateral (
    select
      count(*)::integer as total_count,
      count(*) filter (where milestone.status = 'completed'::public.milestone_status)::integer as completed_count
    from public.milestones as milestone
    where milestone.organization_id = project.organization_id
      and milestone.project_id = project.id
  ) as counts on true
  where project.organization_id = p_organization_id
    and public.client_can_access_project(p_organization_id, project.id);
$$;

create or replace function public.portal_milestones(
  p_organization_id uuid,
  p_project_id uuid
)
returns table (
  id uuid,
  title text,
  description text,
  status public.milestone_status,
  due_date date,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    milestone.id,
    milestone.title,
    milestone.description,
    milestone.status,
    milestone.due_date,
    milestone.sort_order
  from public.milestones as milestone
  where milestone.organization_id = p_organization_id
    and milestone.project_id = p_project_id
    and public.client_can_access_project(p_organization_id, p_project_id)
  order by milestone.sort_order, milestone.due_date;
$$;

create or replace function public.portal_tasks(
  p_organization_id uuid,
  p_project_id uuid
)
returns table (
  id uuid,
  title text,
  description text,
  status public.task_status,
  due_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select task.id, task.title, task.description, task.status, task.due_date
  from public.tasks as task
  where task.organization_id = p_organization_id
    and task.project_id = p_project_id
    and task.visible_to_client = true
    and public.client_can_access_project(p_organization_id, p_project_id);
$$;

create or replace function public.portal_files(p_organization_id uuid)
returns table (
  id uuid,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz,
  context_name text,
  project_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    file.id,
    file.file_name,
    file.mime_type,
    file.size_bytes,
    file.created_at,
    coalesce(project.name, client.name, 'Shared'),
    file.project_id
  from public.files as file
  left join public.projects as project
    on project.id = file.project_id
   and project.organization_id = file.organization_id
  left join public.clients as client
    on client.id = file.client_id
   and client.organization_id = file.organization_id
  where file.organization_id = p_organization_id
    and file.visible_to_client = true
    and public.client_can_access_file(file.organization_id, file.project_id, file.client_id)
  order by file.created_at desc;
$$;

create or replace function public.portal_file_path(
  p_organization_id uuid,
  p_file_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select file.storage_path
  from public.files as file
  where file.id = p_file_id
    and file.organization_id = p_organization_id
    and file.visible_to_client = true
    and public.client_can_access_file(file.organization_id, file.project_id, file.client_id);
$$;

create or replace function public.portal_proposals(p_organization_id uuid)
returns table (
  id uuid,
  proposal_number text,
  title text,
  status public.proposal_status,
  issue_date date,
  valid_until date,
  currency char(3),
  total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    proposal.id,
    proposal.proposal_number,
    proposal.title,
    proposal.status,
    proposal.issue_date,
    proposal.valid_until,
    proposal.currency,
    proposal.total
  from public.proposals as proposal
  where proposal.organization_id = p_organization_id
    and public.client_can_read_proposal(proposal.id);
$$;

create or replace function public.portal_proposal(
  p_organization_id uuid,
  p_proposal_id uuid
)
returns table (
  id uuid,
  proposal_number text,
  title text,
  status public.proposal_status,
  issue_date date,
  valid_until date,
  currency char(3),
  recipient_name text,
  introduction text,
  scope text,
  terms text,
  client_notes text,
  subtotal numeric,
  discount_amount numeric,
  tax_amount numeric,
  total numeric,
  client_response_note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    proposal.id,
    proposal.proposal_number,
    proposal.title,
    proposal.status,
    proposal.issue_date,
    proposal.valid_until,
    proposal.currency,
    proposal.recipient_name,
    proposal.introduction,
    proposal.scope,
    proposal.terms,
    proposal.client_notes,
    proposal.subtotal,
    proposal.discount_amount,
    proposal.tax_amount,
    proposal.total,
    proposal.client_response_note
  from public.proposals as proposal
  where proposal.id = p_proposal_id
    and proposal.organization_id = p_organization_id
    and public.client_can_read_proposal(proposal.id);
$$;

create or replace function public.portal_proposal_items(
  p_organization_id uuid,
  p_proposal_id uuid
)
returns table (
  name text,
  description text,
  quantity numeric,
  unit_price numeric,
  line_total numeric,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select item.name, item.description, item.quantity, item.unit_price, item.line_total, item.sort_order
  from public.proposal_items as item
  where item.organization_id = p_organization_id
    and item.proposal_id = p_proposal_id
    and public.client_can_read_proposal(p_proposal_id)
  order by item.sort_order;
$$;

create or replace function public.portal_identity(p_organization_id uuid)
returns table (
  organization_name text,
  client_name text,
  client_company text
)
language sql
stable
security definer
set search_path = public
as $$
  select organization.name, client.name, client.company
  from public.client_users as link
  join public.organizations as organization on organization.id = link.organization_id
  join public.clients as client
    on client.id = link.client_id
   and client.organization_id = link.organization_id
  where link.organization_id = p_organization_id
    and link.user_id = auth.uid();
$$;

create or replace function public.client_respond_to_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.proposals;
  v_status public.proposal_status;
begin
  if v_user_id is null or p_decision not in ('accept', 'reject') then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  select * into v_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if not found
     or v_proposal.status <> 'sent'::public.proposal_status
     or not public.client_can_read_proposal(v_proposal.id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  v_status := case
    when p_decision = 'accept' then 'accepted'::public.proposal_status
    else 'rejected'::public.proposal_status
  end;

  update public.proposals
  set status = v_status,
      client_response_note = case
        when p_decision = 'reject' then nullif(trim(coalesce(p_reason, '')), '')
        else null
      end
  where id = v_proposal.id
    and organization_id = v_proposal.organization_id
    and status = 'sent'::public.proposal_status;

  if not found then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  return v_status::text;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns public.organization_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_invite public.invitations;
  v_member public.organization_members;
  v_token_hash text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_token is null or length(trim(p_token)) < 32 then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;

  select profile.email into v_email
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_email is null then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  v_token_hash := encode(
    extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
    'hex'
  );

  select * into v_invite
  from public.invitations as invitation
  where invitation.token_hash = v_token_hash
  for update;

  if not found then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;

  if lower(trim(v_invite.email)) <> lower(trim(v_email)) then
    raise exception 'Invitation email mismatch' using errcode = '42501';
  end if;

  if v_invite.accepted_at is null and v_invite.expires_at <= now() then
    raise exception 'Invitation expired' using errcode = '22023';
  end if;

  select * into v_member
  from public.organization_members as member
  where member.organization_id = v_invite.organization_id
    and member.user_id = v_user_id;

  if found and v_member.role is distinct from v_invite.role then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if not found then
    if v_invite.accepted_at is not null then
      raise exception 'Invitation already accepted' using errcode = '22023';
    end if;

    insert into public.organization_members (organization_id, user_id, role)
    values (v_invite.organization_id, v_user_id, v_invite.role)
    returning * into v_member;
  end if;

  if v_invite.role = 'client'::public.org_role then
    insert into public.client_users (organization_id, client_id, user_id, created_by)
    values (
      v_invite.organization_id,
      v_invite.client_id,
      v_user_id,
      coalesce(v_invite.invited_by, v_user_id)
    )
    on conflict (organization_id, client_id, user_id) do nothing;
  end if;

  if v_invite.accepted_at is null then
    update public.invitations
    set accepted_at = now()
    where id = v_invite.id;
  end if;

  return v_member;
end;
$$;

create or replace function public.revoke_client_portal_access(
  p_organization_id uuid,
  p_client_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or p_organization_id is null or p_client_id is null or p_user_id is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if not public.has_org_role(
    p_organization_id,
    array['owner'::public.org_role, 'admin'::public.org_role]
  ) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  delete from public.client_users as link
  where link.organization_id = p_organization_id
    and link.client_id = p_client_id
    and link.user_id = p_user_id;

  if not found then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.client_users as remaining
    where remaining.organization_id = p_organization_id
      and remaining.user_id = p_user_id
  ) then
    delete from public.organization_members as member
    where member.organization_id = p_organization_id
      and member.user_id = p_user_id
      and member.role = 'client'::public.org_role;
  end if;

  return true;
end;
$$;

revoke all on function public.enforce_client_user_role() from public, anon, authenticated;
revoke all on function public.client_mapped_to(uuid, uuid) from public, anon, authenticated;
revoke all on function public.client_can_access_project(uuid, uuid) from public, anon, authenticated;
revoke all on function public.client_can_access_file(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.client_can_read_proposal(uuid) from public, anon, authenticated;
revoke all on function public.portal_projects(uuid) from public, anon;
revoke all on function public.portal_milestones(uuid, uuid) from public, anon;
revoke all on function public.portal_tasks(uuid, uuid) from public, anon;
revoke all on function public.portal_files(uuid) from public, anon;
revoke all on function public.portal_file_path(uuid, uuid) from public, anon;
revoke all on function public.portal_proposals(uuid) from public, anon;
revoke all on function public.portal_proposal(uuid, uuid) from public, anon;
revoke all on function public.portal_proposal_items(uuid, uuid) from public, anon;
revoke all on function public.portal_identity(uuid) from public, anon;
revoke all on function public.client_respond_to_proposal(uuid, text, text) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.revoke_client_portal_access(uuid, uuid, uuid) from public, anon;

grant execute on function public.portal_projects(uuid) to authenticated;
grant execute on function public.portal_milestones(uuid, uuid) to authenticated;
grant execute on function public.portal_tasks(uuid, uuid) to authenticated;
grant execute on function public.portal_files(uuid) to authenticated;
grant execute on function public.portal_file_path(uuid, uuid) to authenticated;
grant execute on function public.portal_proposals(uuid) to authenticated;
grant execute on function public.portal_proposal(uuid, uuid) to authenticated;
grant execute on function public.portal_proposal_items(uuid, uuid) to authenticated;
grant execute on function public.portal_identity(uuid) to authenticated;
grant execute on function public.client_respond_to_proposal(uuid, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.revoke_client_portal_access(uuid, uuid, uuid) to authenticated;

revoke all on table public.client_users from public, anon;
grant select on table public.client_users to authenticated;

alter table public.client_users enable row level security;
alter table public.client_users force row level security;

create policy client_users_select_staff_or_self
  on public.client_users
  for select
  to authenticated
  using (public.is_staff(organization_id) or user_id = auth.uid());

create policy invitations_insert_client_portal
  on public.invitations
  for insert
  to authenticated
  with check (
    role = 'client'::public.org_role
    and client_id is not null
    and invited_by = auth.uid()
    and public.has_org_role(
      organization_id,
      array[
        'owner'::public.org_role,
        'admin'::public.org_role,
        'project_manager'::public.org_role
      ]
    )
  );
