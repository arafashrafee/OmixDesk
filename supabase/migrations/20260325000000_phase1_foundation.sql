-- Phase 1: Foundation — profiles, organizations, membership, invitations, RLS
-- OmixDesk multi-tenant tenancy boundary.
-- No service-role required for application paths; SECURITY DEFINER used only where justified.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.org_role as enum (
  'owner',
  'admin',
  'project_manager',
  'member',
  'client'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_nonempty check (length(trim(email)) > 0)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  timezone text not null default 'UTC',
  default_currency text not null default 'USD',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_nonempty check (length(trim(name)) > 0),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organizations_timezone_nonempty check (length(trim(timezone)) > 0),
  constraint organizations_currency_format check (default_currency ~ '^[A-Z]{3}$')
);

create unique index organizations_slug_key on public.organizations (slug);

-- Composite uniqueness supports future composite FKs: (organization_id, id)
create unique index organizations_id_org_key on public.organizations (id);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  constraint organization_members_unique_user unique (organization_id, user_id),
  -- Clients must never be added via staff membership paths incorrectly later;
  -- Phase 1 invites are staff-only (see invitations check).
  constraint organization_members_role_known check (
    role in (
      'owner'::public.org_role,
      'admin'::public.org_role,
      'project_manager'::public.org_role,
      'member'::public.org_role,
      'client'::public.org_role
    )
  )
);

create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_members_organization_id_idx on public.organization_members (organization_id);
create index organization_members_org_role_idx on public.organization_members (organization_id, role);

-- Staff invitations only in Phase 1 (client invites require clients table in a later phase).
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.org_role not null,
  token_hash text not null,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_email_nonempty check (length(trim(email)) > 0),
  constraint invitations_staff_roles_only check (
    role in (
      'admin'::public.org_role,
      'project_manager'::public.org_role,
      'member'::public.org_role
    )
  ),
  constraint invitations_token_hash_nonempty check (length(token_hash) > 0)
);

create unique index invitations_token_hash_key on public.invitations (token_hash);
create index invitations_organization_id_idx on public.invitations (organization_id);
create index invitations_email_pending_idx
  on public.invitations (organization_id, lower(email))
  where accepted_at is null;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile bootstrap from auth.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER, fixed search_path, minimal surface)
-- ---------------------------------------------------------------------------

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid();
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members as m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role(p_organization_id uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members as m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_staff(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members as m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in (
        'owner'::public.org_role,
        'admin'::public.org_role,
        'project_manager'::public.org_role,
        'member'::public.org_role
      )
  );
$$;

create or replace function public.has_org_role(
  p_organization_id uuid,
  p_roles public.org_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members as m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

revoke all on function public.current_user_id() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.org_role(uuid) from public;
revoke all on function public.is_staff(uuid) from public;
revoke all on function public.has_org_role(uuid, public.org_role[]) from public;

grant execute on function public.current_user_id() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.org_role(uuid) to authenticated;
grant execute on function public.is_staff(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic org creation (justified SECURITY DEFINER: RLS cannot insert membership
-- before membership exists; must be atomic with org insert)
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(
  p_name text,
  p_timezone text default 'UTC',
  p_default_currency text default 'USD'
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_base_slug text;
  v_slug text;
  v_suffix int := 0;
  v_org public.organizations;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Organization name is required' using errcode = '22023';
  end if;

  if p_timezone is null or length(trim(p_timezone)) = 0 then
    raise exception 'Timezone is required' using errcode = '22023';
  end if;

  if p_default_currency is null or p_default_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a 3-letter ISO code' using errcode = '22023';
  end if;

  v_base_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug is null or length(v_base_slug) = 0 then
    v_base_slug := 'org';
  end if;
  v_base_slug := left(v_base_slug, 48);
  v_slug := v_base_slug;

  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := left(v_base_slug, 40) || '-' || v_suffix::text;
  end loop;

  insert into public.organizations (
    name,
    slug,
    timezone,
    default_currency,
    created_by
  )
  values (
    trim(p_name),
    v_slug,
    trim(p_timezone),
    p_default_currency,
    v_user_id
  )
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, v_user_id, 'owner'::public.org_role);

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, text, text) from public;
grant execute on function public.create_organization(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Accept invitation (justified SECURITY DEFINER: inserts membership after
-- validating token hash + email match; callers never write membership directly)
-- ---------------------------------------------------------------------------

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

  select p.email into v_email
  from public.profiles p
  where p.id = v_user_id;

  if v_email is null then
    raise exception 'Profile not found' using errcode = '42501';
  end if;

  v_token_hash := encode(
    extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
    'hex'
  );

  select * into v_invite
  from public.invitations i
  where i.token_hash = v_token_hash
  for update;

  if not found then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'Invitation already accepted' using errcode = '22023';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'Invitation expired' using errcode = '22023';
  end if;

  if lower(trim(v_invite.email)) <> lower(trim(v_email)) then
    raise exception 'Invitation email mismatch' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.organization_members m
    where m.organization_id = v_invite.organization_id
      and m.user_id = v_user_id
  ) then
    update public.invitations
    set accepted_at = now()
    where id = v_invite.id;

    select * into v_member
    from public.organization_members m
    where m.organization_id = v_invite.organization_id
      and m.user_id = v_user_id;

    return v_member;
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_invite.organization_id, v_user_id, v_invite.role)
  returning * into v_member;

  update public.invitations
  set accepted_at = now()
  where id = v_invite.id;

  return v_member;
end;
$$;

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Last-owner protection
-- ---------------------------------------------------------------------------

create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_remaining int;
begin
  if tg_op = 'DELETE' then
    v_org_id := old.organization_id;
    if old.role = 'owner'::public.org_role then
      select count(*) into v_remaining
      from public.organization_members m
      where m.organization_id = v_org_id
        and m.role = 'owner'::public.org_role
        and m.id <> old.id;
      if v_remaining = 0 then
        raise exception 'Cannot remove the last owner' using errcode = 'P0001';
      end if;
    end if;
    return old;
  end if;

  -- UPDATE
  v_org_id := new.organization_id;
  if old.role = 'owner'::public.org_role
     and new.role is distinct from 'owner'::public.org_role then
    select count(*) into v_remaining
    from public.organization_members m
    where m.organization_id = v_org_id
      and m.role = 'owner'::public.org_role
      and m.id <> old.id;
    if v_remaining = 0 then
      raise exception 'Cannot demote the last owner' using errcode = 'P0001';
    end if;
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'Cannot move membership across organizations' using errcode = 'P0001';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'Cannot reassign membership user' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger organization_members_protect_last_owner
  before update or delete on public.organization_members
  for each row execute function public.protect_last_owner();

revoke all on function public.protect_last_owner() from public;

-- ---------------------------------------------------------------------------
-- Grants (minimize PUBLIC/anon)
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from public, anon;
revoke all on table public.organizations from public, anon;
revoke all on table public.organization_members from public, anon;
revoke all on table public.invitations from public, anon;

grant select, update on table public.profiles to authenticated;
grant select, update on table public.organizations to authenticated;
grant select, update, delete on table public.organization_members to authenticated;
grant select, insert, update, delete on table public.invitations to authenticated;

-- Inserts into organizations / organization_members happen via SECURITY DEFINER RPCs.
-- No direct INSERT grants on those tables for authenticated.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;

alter table public.profiles force row level security;
alter table public.organizations force row level security;
alter table public.organization_members force row level security;
alter table public.invitations force row level security;

-- profiles
create policy profiles_select_self_or_shared_org
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.organization_members as mine
      join public.organization_members as theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = auth.uid()
        and theirs.user_id = profiles.id
    )
  );

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- organizations
create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (public.is_org_member(id));

create policy organizations_update_owner_admin
  on public.organizations
  for update
  to authenticated
  using (
    public.has_org_role(
      id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    )
  )
  with check (
    public.has_org_role(
      id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    )
  );

-- organization_members
create policy organization_members_select_same_org
  on public.organization_members
  for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy organization_members_update_owner_admin
  on public.organization_members
  for update
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    )
  )
  with check (
    public.has_org_role(
      organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    )
    -- Only owner may assign/demote the owner role
    and (
      role <> 'owner'::public.org_role
      or public.has_org_role(
        organization_id,
        array['owner'::public.org_role]
      )
    )
  );

create policy organization_members_delete_owner_admin
  on public.organization_members
  for delete
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    )
    -- Non-owners cannot remove an owner
    and (
      role <> 'owner'::public.org_role
      or public.has_org_role(
        organization_id,
        array['owner'::public.org_role]
      )
    )
  );

-- invitations
create policy invitations_select_owner_admin
  on public.invitations
  for select
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    )
  );

create policy invitations_insert_owner_admin
  on public.invitations
  for insert
  to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    )
    and role in (
      'admin'::public.org_role,
      'project_manager'::public.org_role,
      'member'::public.org_role
    )
    and invited_by = auth.uid()
  );

create policy invitations_update_owner_admin
  on public.invitations
  for update
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    )
  )
  with check (
    public.has_org_role(
      organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    )
  );

create policy invitations_delete_owner_admin
  on public.invitations
  for delete
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    )
  );
