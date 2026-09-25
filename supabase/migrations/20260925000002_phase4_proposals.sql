-- Phase 4: proposals and quotation items.
-- Additive only. Does not alter Phase 1–3 policies.
--
-- Ownership: exactly one of lead_id or client_id. No dual link.
-- Money columns and proposal_number are written by triggers/owner functions.
-- authenticated cannot update those columns.
-- Only draft proposals can change commercial content or be deleted.
-- Client role has no policies.

create type public.proposal_status as enum (
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired'
);

create type public.discount_type as enum (
  'fixed',
  'percentage'
);

alter table public.organizations
  add column email text,
  add column phone text,
  add column address text,
  add column website text;

alter table public.organizations
  add constraint organizations_contact_email_len check (email is null or char_length(email) <= 200),
  add constraint organizations_contact_phone_len check (phone is null or char_length(phone) <= 40),
  add constraint organizations_contact_address_len check (address is null or char_length(address) <= 500),
  add constraint organizations_contact_website_len check (website is null or char_length(website) <= 200);

create table public.proposal_number_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  year integer not null,
  last_value integer not null,
  primary key (organization_id, year),
  constraint proposal_number_counters_year_check check (year between 2000 and 2100),
  constraint proposal_number_counters_value_check check (last_value >= 0)
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  proposal_number text not null default '',
  title text not null,
  lead_id uuid,
  client_id uuid,
  status public.proposal_status not null default 'draft',
  issue_date date not null,
  valid_until date,
  currency char(3) not null,
  recipient_name text not null,
  recipient_company text,
  recipient_email text,
  recipient_phone text,
  recipient_address text,
  introduction text,
  scope text,
  terms text,
  client_notes text,
  internal_notes text,
  subtotal numeric(14, 2) not null default 0,
  discount_type public.discount_type,
  discount_value numeric(14, 2),
  discount_amount numeric(14, 2) not null default 0,
  tax_percent numeric(7, 4),
  tax_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposals_org_id_key unique (organization_id, id),
  constraint proposals_number_per_org unique (organization_id, proposal_number),
  constraint proposals_title_nonempty check (char_length(trim(title)) > 0),
  constraint proposals_recipient_nonempty check (char_length(trim(recipient_name)) > 0),
  constraint proposals_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint proposals_one_source check (
    ((lead_id is not null)::integer + (client_id is not null)::integer) = 1
  ),
  constraint proposals_amounts_nonnegative check (
    subtotal >= 0
    and discount_amount >= 0
    and tax_amount >= 0
    and total >= 0
    and discount_amount <= subtotal
  ),
  constraint proposals_discount_shape check (
    (
      discount_type is null
      and discount_value is null
      and discount_amount = 0
    )
    or (
      discount_type = 'fixed'
      and discount_value is not null
      and discount_value >= 0
    )
    or (
      discount_type = 'percentage'
      and discount_value is not null
      and discount_value >= 0
      and discount_value <= 100
    )
  ),
  constraint proposals_tax_range check (
    tax_percent is null or (tax_percent >= 0 and tax_percent <= 100)
  ),
  constraint proposals_lead_same_org
    foreign key (organization_id, lead_id)
    references public.leads (organization_id, id)
    on delete restrict,
  constraint proposals_client_same_org
    foreign key (organization_id, client_id)
    references public.clients (organization_id, id)
    on delete restrict
);

create index proposals_org_status_idx on public.proposals (organization_id, status);

create table public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  proposal_id uuid not null,
  sort_order integer not null default 0,
  name text not null,
  description text,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(14, 2) not null,
  line_total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_items_name_nonempty check (char_length(trim(name)) > 0),
  constraint proposal_items_quantity_positive check (quantity > 0),
  constraint proposal_items_price_nonnegative check (unit_price >= 0 and line_total >= 0),
  constraint proposal_items_sort_nonnegative check (sort_order >= 0),
  constraint proposal_items_org_proposal_id_key unique (organization_id, proposal_id, id),
  constraint proposal_items_proposal_same_org
    foreign key (organization_id, proposal_id)
    references public.proposals (organization_id, id)
    on delete cascade
);

create index proposal_items_proposal_idx
  on public.proposal_items (organization_id, proposal_id, sort_order);

create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

create trigger proposal_items_set_updated_at
  before update on public.proposal_items
  for each row execute function public.set_updated_at();

create trigger proposals_protect_tenant
  before update on public.proposals
  for each row execute function public.prevent_organization_id_change();

create trigger proposals_protect_actor
  before update on public.proposals
  for each row execute function public.prevent_actor_reassignment();

-- ---------------------------------------------------------------------------
-- Numbering and totals. Owner-only writers. authenticated cannot call these.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_proposals(p_organization_id uuid)
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

create or replace function public.allocate_proposal_number(
  p_organization_id uuid,
  p_year integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if auth.uid() is null or not public.is_staff(p_organization_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  insert into public.proposal_number_counters as counters (organization_id, year, last_value)
  values (p_organization_id, p_year, 1)
  on conflict (organization_id, year)
  do update set last_value = counters.last_value + 1
  returning last_value into v_next;

  return 'OMX-' || p_year::text || '-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.assign_proposal_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.proposal_number := public.allocate_proposal_number(
      new.organization_id,
      extract(year from new.issue_date)::integer
    );
    return new;
  end if;

  if new.proposal_number is distinct from old.proposal_number then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger proposals_assign_number
  before insert or update on public.proposals
  for each row execute function public.assign_proposal_number();

create or replace function public.proposal_is_editable(
  p_organization_id uuid,
  p_proposal_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff(p_organization_id)
    and exists (
      select 1
      from public.proposals as proposal
      where proposal.organization_id = p_organization_id
        and proposal.id = p_proposal_id
        and proposal.status = 'draft'::public.proposal_status
    );
$$;

create or replace function public.compute_line_total(
  p_quantity numeric,
  p_unit_price numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select round(p_quantity * p_unit_price, 2);
$$;

create or replace function public.apply_proposal_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subtotal numeric(14, 2);
  v_discount numeric(14, 2);
  v_taxable numeric(14, 2);
  v_tax numeric(14, 2);
begin
  select coalesce(sum(item.line_total), 0)
    into v_subtotal
  from public.proposal_items as item
  where item.organization_id = new.organization_id
    and item.proposal_id = new.id;

  if new.discount_type is null or new.discount_value is null then
    v_discount := 0;
    new.discount_type := null;
    new.discount_value := null;
  elsif new.discount_type = 'percentage'::public.discount_type then
    if new.discount_value < 0 or new.discount_value > 100 then
      raise exception 'You do not have access.' using errcode = '22023';
    end if;
    v_discount := round(v_subtotal * new.discount_value / 100, 2);
  else
    if new.discount_value < 0 then
      raise exception 'You do not have access.' using errcode = '22023';
    end if;
    v_discount := round(new.discount_value, 2);
  end if;

  if v_discount > v_subtotal then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  if new.tax_percent is not null and (new.tax_percent < 0 or new.tax_percent > 100) then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  v_taxable := v_subtotal - v_discount;
  v_tax := case
    when new.tax_percent is null then 0
    else round(v_taxable * new.tax_percent / 100, 2)
  end;

  new.subtotal := v_subtotal;
  new.discount_amount := v_discount;
  new.tax_amount := v_tax;
  new.total := v_taxable + v_tax;
  return new;
end;
$$;

create trigger proposals_apply_totals
  before insert or update on public.proposals
  for each row execute function public.apply_proposal_totals();

create or replace function public.enforce_proposal_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items integer;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft'::public.proposal_status then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft'::public.proposal_status then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    new.accepted_at := null;
    new.rejected_at := null;
    return new;
  end if;

  if old.status = 'accepted'::public.proposal_status then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if old.status = 'draft'::public.proposal_status then
    if new.status not in ('draft'::public.proposal_status, 'sent'::public.proposal_status) then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    if new.status = 'sent'::public.proposal_status then
      select count(*) into v_items
      from public.proposal_items as item
      where item.organization_id = new.organization_id
        and item.proposal_id = new.id;
      if v_items < 1 or char_length(trim(new.recipient_name)) = 0 then
        raise exception 'You do not have access.' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;

  if old.status = 'sent'::public.proposal_status then
    if new.status not in (
      'accepted'::public.proposal_status,
      'rejected'::public.proposal_status,
      'expired'::public.proposal_status
    ) then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    if new.title is distinct from old.title
       or new.lead_id is distinct from old.lead_id
       or new.client_id is distinct from old.client_id
       or new.issue_date is distinct from old.issue_date
       or new.valid_until is distinct from old.valid_until
       or new.currency is distinct from old.currency
       or new.recipient_name is distinct from old.recipient_name
       or new.recipient_company is distinct from old.recipient_company
       or new.recipient_email is distinct from old.recipient_email
       or new.recipient_phone is distinct from old.recipient_phone
       or new.recipient_address is distinct from old.recipient_address
       or new.introduction is distinct from old.introduction
       or new.scope is distinct from old.scope
       or new.terms is distinct from old.terms
       or new.client_notes is distinct from old.client_notes
       or new.discount_type is distinct from old.discount_type
       or new.discount_value is distinct from old.discount_value
       or new.tax_percent is distinct from old.tax_percent
       or new.subtotal is distinct from old.subtotal
       or new.total is distinct from old.total then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    if new.status = 'accepted'::public.proposal_status then
      new.accepted_at := now();
      new.rejected_at := null;
    elsif new.status = 'rejected'::public.proposal_status then
      new.rejected_at := now();
      new.accepted_at := null;
    end if;
    return new;
  end if;

  if old.status in ('rejected'::public.proposal_status, 'expired'::public.proposal_status) then
    if new.status <> 'draft'::public.proposal_status then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    if new.title is distinct from old.title
       or new.lead_id is distinct from old.lead_id
       or new.client_id is distinct from old.client_id
       or new.currency is distinct from old.currency
       or new.recipient_name is distinct from old.recipient_name
       or new.subtotal is distinct from old.subtotal
       or new.total is distinct from old.total then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    new.accepted_at := null;
    new.rejected_at := null;
    return new;
  end if;

  return new;
end;
$$;

create trigger proposals_enforce_lifecycle
  before insert or update or delete on public.proposals
  for each row execute function public.enforce_proposal_lifecycle();

create or replace function public.prepare_proposal_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.proposal_is_editable(new.organization_id, new.proposal_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  new.line_total := public.compute_line_total(new.quantity, new.unit_price);
  return new;
end;
$$;

create trigger proposal_items_prepare
  before insert or update on public.proposal_items
  for each row execute function public.prepare_proposal_item();

create or replace function public.guard_proposal_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.proposals as proposal
    where proposal.organization_id = old.organization_id
      and proposal.id = old.proposal_id
  ) then
    return old;
  end if;

  if not public.proposal_is_editable(old.organization_id, old.proposal_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger proposal_items_guard_delete
  before delete on public.proposal_items
  for each row execute function public.guard_proposal_item_delete();

create or replace function public.refresh_proposal_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal_id uuid;
  v_organization_id uuid;
begin
  v_proposal_id := coalesce(new.proposal_id, old.proposal_id);
  v_organization_id := coalesce(new.organization_id, old.organization_id);

  update public.proposals
  set updated_at = now()
  where id = v_proposal_id
    and organization_id = v_organization_id;

  return null;
end;
$$;

create trigger proposal_items_refresh_totals
  after insert or update or delete on public.proposal_items
  for each row execute function public.refresh_proposal_totals();

-- One transaction for a draft header and its lines. The caller cannot supply
-- line totals or proposal totals. Trigger logic recomputes them before commit.
create or replace function public.save_draft_proposal(
  p_organization_id uuid,
  p_proposal_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_title text;
  v_lead_id uuid;
  v_client_id uuid;
  v_issue_date date;
  v_valid_until date;
  v_currency text;
  v_discount_type public.discount_type;
  v_discount_value numeric(14, 2);
  v_tax_percent numeric(7, 4);
  v_item jsonb;
  v_index integer := 0;
  v_count integer;
begin
  if v_user_id is null or p_organization_id is null or p_payload is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if not public.can_manage_proposals(p_organization_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  v_title := nullif(trim(coalesce(p_payload ->> 'title', '')), '');
  if v_title is null or char_length(v_title) > 160 then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  v_lead_id := nullif(p_payload ->> 'lead_id', '')::uuid;
  v_client_id := nullif(p_payload ->> 'client_id', '')::uuid;
  if ((v_lead_id is not null)::integer + (v_client_id is not null)::integer) <> 1 then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  if v_lead_id is not null and not exists (
    select 1 from public.leads as lead
    where lead.id = v_lead_id and lead.organization_id = p_organization_id
  ) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if v_client_id is not null and not exists (
    select 1 from public.clients as client
    where client.id = v_client_id and client.organization_id = p_organization_id
  ) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  v_issue_date := (p_payload ->> 'issue_date')::date;
  v_valid_until := nullif(p_payload ->> 'valid_until', '')::date;
  v_currency := upper(trim(coalesce(p_payload ->> 'currency', '')));
  if v_currency !~ '^[A-Z]{3}$' or nullif(trim(coalesce(p_payload ->> 'recipient_name', '')), '') is null then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  if nullif(p_payload ->> 'discount_type', '') is null then
    v_discount_type := null;
    v_discount_value := null;
  else
    v_discount_type := (p_payload ->> 'discount_type')::public.discount_type;
    v_discount_value := (p_payload ->> 'discount_value')::numeric(14, 2);
  end if;
  v_tax_percent := nullif(p_payload ->> 'tax_percent', '')::numeric(7, 4);

  v_count := coalesce(jsonb_array_length(p_payload -> 'items'), 0);
  if v_count < 1 or v_count > 40 then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  if p_proposal_id is null then
    insert into public.proposals (
      organization_id,
      title,
      lead_id,
      client_id,
      status,
      issue_date,
      valid_until,
      currency,
      recipient_name,
      recipient_company,
      recipient_email,
      recipient_phone,
      recipient_address,
      introduction,
      scope,
      terms,
      client_notes,
      internal_notes,
      discount_type,
      discount_value,
      tax_percent,
      created_by
    )
    values (
      p_organization_id,
      v_title,
      v_lead_id,
      v_client_id,
      'draft'::public.proposal_status,
      v_issue_date,
      v_valid_until,
      v_currency,
      trim(p_payload ->> 'recipient_name'),
      nullif(trim(coalesce(p_payload ->> 'recipient_company', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'recipient_email', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'recipient_phone', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'recipient_address', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'introduction', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'scope', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'terms', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'client_notes', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'internal_notes', '')), ''),
      null,
      null,
      null,
      v_user_id
    )
    returning id into v_id;
  else
    select proposal.id into v_id
    from public.proposals as proposal
    where proposal.id = p_proposal_id
      and proposal.organization_id = p_organization_id
      and proposal.status = 'draft'::public.proposal_status
    for update;

    if v_id is null then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;

    update public.proposals
    set title = v_title,
        lead_id = v_lead_id,
        client_id = v_client_id,
        issue_date = v_issue_date,
        valid_until = v_valid_until,
        currency = v_currency,
        recipient_name = trim(p_payload ->> 'recipient_name'),
        recipient_company = nullif(trim(coalesce(p_payload ->> 'recipient_company', '')), ''),
        recipient_email = nullif(trim(coalesce(p_payload ->> 'recipient_email', '')), ''),
        recipient_phone = nullif(trim(coalesce(p_payload ->> 'recipient_phone', '')), ''),
        recipient_address = nullif(trim(coalesce(p_payload ->> 'recipient_address', '')), ''),
        introduction = nullif(trim(coalesce(p_payload ->> 'introduction', '')), ''),
        scope = nullif(trim(coalesce(p_payload ->> 'scope', '')), ''),
        terms = nullif(trim(coalesce(p_payload ->> 'terms', '')), ''),
        client_notes = nullif(trim(coalesce(p_payload ->> 'client_notes', '')), ''),
        internal_notes = nullif(trim(coalesce(p_payload ->> 'internal_notes', '')), ''),
        discount_type = null,
        discount_value = null,
        tax_percent = null
    where id = v_id
      and organization_id = p_organization_id;

    delete from public.proposal_items
    where organization_id = p_organization_id
      and proposal_id = v_id;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_payload -> 'items')
  loop
    if nullif(trim(coalesce(v_item ->> 'name', '')), '') is null
       or coalesce((v_item ->> 'quantity')::numeric, 0) <= 0
       or coalesce((v_item ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'You do not have access.' using errcode = '22023';
    end if;

    insert into public.proposal_items (
      organization_id,
      proposal_id,
      sort_order,
      name,
      description,
      quantity,
      unit_price
    )
    values (
      p_organization_id,
      v_id,
      v_index,
      trim(v_item ->> 'name'),
      nullif(trim(coalesce(v_item ->> 'description', '')), ''),
      round((v_item ->> 'quantity')::numeric, 2),
      round((v_item ->> 'unit_price')::numeric, 2)
    );
    v_index := v_index + 1;
  end loop;

  update public.proposals
  set discount_type = v_discount_type,
      discount_value = v_discount_value,
      tax_percent = v_tax_percent
  where id = v_id
    and organization_id = p_organization_id;

  return v_id;
end;
$$;

revoke all on function public.can_manage_proposals(uuid) from public, anon;
revoke all on function public.allocate_proposal_number(uuid, integer) from public, anon, authenticated;
revoke all on function public.assign_proposal_number() from public, anon, authenticated;
revoke all on function public.proposal_is_editable(uuid, uuid) from public, anon;
revoke all on function public.compute_line_total(numeric, numeric) from public, anon, authenticated;
revoke all on function public.apply_proposal_totals() from public, anon, authenticated;
revoke all on function public.enforce_proposal_lifecycle() from public, anon, authenticated;
revoke all on function public.prepare_proposal_item() from public, anon, authenticated;
revoke all on function public.guard_proposal_item_delete() from public, anon, authenticated;
revoke all on function public.refresh_proposal_totals() from public, anon, authenticated;
revoke all on function public.save_draft_proposal(uuid, uuid, jsonb) from public, anon;

grant execute on function public.can_manage_proposals(uuid) to authenticated;
grant execute on function public.proposal_is_editable(uuid, uuid) to authenticated;
grant execute on function public.save_draft_proposal(uuid, uuid, jsonb) to authenticated;

revoke all on table public.proposal_number_counters from public, anon, authenticated;
revoke all on table public.proposals from public, anon;
revoke all on table public.proposal_items from public, anon;

alter table public.proposal_number_counters enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;
alter table public.proposal_number_counters force row level security;
alter table public.proposals force row level security;
alter table public.proposal_items force row level security;

grant select, delete on table public.proposals to authenticated;
grant insert (
  organization_id,
  title,
  lead_id,
  client_id,
  status,
  issue_date,
  valid_until,
  currency,
  recipient_name,
  recipient_company,
  recipient_email,
  recipient_phone,
  recipient_address,
  introduction,
  scope,
  terms,
  client_notes,
  internal_notes,
  discount_type,
  discount_value,
  tax_percent,
  created_by
) on table public.proposals to authenticated;
grant update (
  title,
  lead_id,
  client_id,
  status,
  issue_date,
  valid_until,
  currency,
  recipient_name,
  recipient_company,
  recipient_email,
  recipient_phone,
  recipient_address,
  introduction,
  scope,
  terms,
  client_notes,
  internal_notes,
  discount_type,
  discount_value,
  tax_percent
) on table public.proposals to authenticated;

grant select, delete on table public.proposal_items to authenticated;
grant insert (
  organization_id,
  proposal_id,
  sort_order,
  name,
  description,
  quantity,
  unit_price
) on table public.proposal_items to authenticated;
grant update (
  sort_order,
  name,
  description,
  quantity,
  unit_price
) on table public.proposal_items to authenticated;

create policy proposals_select_staff
  on public.proposals
  for select
  to authenticated
  using (public.is_staff(organization_id));

create policy proposals_insert_managers
  on public.proposals
  for insert
  to authenticated
  with check (
    public.can_manage_proposals(organization_id)
    and created_by = auth.uid()
    and status = 'draft'::public.proposal_status
  );

create policy proposals_update_managers
  on public.proposals
  for update
  to authenticated
  using (public.can_manage_proposals(organization_id))
  with check (public.can_manage_proposals(organization_id));

create policy proposals_delete_draft_managers
  on public.proposals
  for delete
  to authenticated
  using (
    public.can_manage_proposals(organization_id)
    and status = 'draft'::public.proposal_status
  );

create policy proposal_items_select_staff
  on public.proposal_items
  for select
  to authenticated
  using (public.is_staff(organization_id));

create policy proposal_items_insert_managers
  on public.proposal_items
  for insert
  to authenticated
  with check (
    public.can_manage_proposals(organization_id)
    and public.proposal_is_editable(organization_id, proposal_id)
  );

create policy proposal_items_update_managers
  on public.proposal_items
  for update
  to authenticated
  using (
    public.can_manage_proposals(organization_id)
    and public.proposal_is_editable(organization_id, proposal_id)
  )
  with check (
    public.can_manage_proposals(organization_id)
    and public.proposal_is_editable(organization_id, proposal_id)
  );

create policy proposal_items_delete_managers
  on public.proposal_items
  for delete
  to authenticated
  using (
    public.can_manage_proposals(organization_id)
    and public.proposal_is_editable(organization_id, proposal_id)
  );
