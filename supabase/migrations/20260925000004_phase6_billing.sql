-- Phase 6: invoices, invoice items, and manually recorded payments.
-- Staff and clients share authenticated. Clients do not get SELECT on these
-- tables. Portal functions return explicit columns.

create type public.invoice_status as enum (
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'void'
);

create type public.payment_method as enum (
  'bank_transfer',
  'cash',
  'bkash',
  'nagad',
  'card',
  'cheque',
  'other'
);

create table public.invoice_number_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  year integer not null,
  last_value integer not null,
  primary key (organization_id, year),
  constraint invoice_number_counters_year_check check (year between 2000 and 2100),
  constraint invoice_number_counters_value_check check (last_value >= 0)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  project_id uuid,
  proposal_id uuid,
  invoice_number text not null default '',
  title text not null,
  status public.invoice_status not null default 'draft',
  issue_date date not null,
  due_date date not null,
  currency char(3) not null,
  recipient_name text not null,
  recipient_company text,
  recipient_email text,
  recipient_phone text,
  recipient_address text,
  notes text,
  terms text,
  internal_notes text,
  subtotal numeric(14, 2) not null default 0,
  discount_type public.discount_type,
  discount_value numeric(14, 2),
  discount_amount numeric(14, 2) not null default 0,
  tax_percent numeric(7, 4),
  tax_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  balance_due numeric(14, 2) not null default 0,
  issued_at timestamptz,
  paid_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_org_id_key unique (organization_id, id),
  constraint invoices_number_per_org unique (organization_id, invoice_number),
  constraint invoices_title_nonempty check (char_length(trim(title)) > 0),
  constraint invoices_recipient_nonempty check (char_length(trim(recipient_name)) > 0),
  constraint invoices_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint invoices_amounts_nonnegative check (
    subtotal >= 0
    and discount_amount >= 0
    and tax_amount >= 0
    and total >= 0
    and amount_paid >= 0
    and balance_due >= 0
    and discount_amount <= subtotal
    and amount_paid <= total
  ),
  constraint invoices_discount_shape check (
    (discount_type is null and discount_value is null and discount_amount = 0)
    or (discount_type = 'fixed' and discount_value is not null and discount_value >= 0)
    or (
      discount_type = 'percentage'
      and discount_value is not null
      and discount_value >= 0
      and discount_value <= 100
    )
  ),
  constraint invoices_tax_range check (
    tax_percent is null or (tax_percent >= 0 and tax_percent <= 100)
  ),
  constraint invoices_due_on_or_after_issue check (due_date >= issue_date),
  constraint invoices_client_same_org
    foreign key (organization_id, client_id)
    references public.clients (organization_id, id)
    on delete restrict,
  constraint invoices_project_same_org
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id)
    on delete restrict,
  constraint invoices_proposal_same_org
    foreign key (organization_id, proposal_id)
    references public.proposals (organization_id, id)
    on delete restrict
);

create index invoices_org_status_idx on public.invoices (organization_id, status);
create index invoices_org_client_idx on public.invoices (organization_id, client_id);
create index invoices_org_due_idx on public.invoices (organization_id, due_date);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null,
  description text not null,
  quantity numeric(12, 2) not null,
  unit_price numeric(14, 2) not null,
  line_total numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint invoice_items_description_nonempty check (char_length(trim(description)) > 0),
  constraint invoice_items_quantity_positive check (quantity > 0),
  constraint invoice_items_price_nonnegative check (unit_price >= 0 and line_total >= 0),
  constraint invoice_items_invoice_same_org
    foreign key (organization_id, invoice_id)
    references public.invoices (organization_id, id)
    on delete cascade
);

create index invoice_items_invoice_idx
  on public.invoice_items (organization_id, invoice_id, sort_order);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null,
  amount numeric(14, 2) not null,
  payment_date date not null,
  payment_method public.payment_method not null,
  reference text,
  notes text,
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payments_amount_positive check (amount > 0),
  constraint payments_invoice_same_org
    foreign key (organization_id, invoice_id)
    references public.invoices (organization_id, id)
    on delete restrict
);

create index payments_invoice_idx on public.payments (organization_id, invoice_id, payment_date);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger invoices_protect_tenant
  before update on public.invoices
  for each row execute function public.prevent_organization_id_change();

create trigger invoices_protect_actor
  before update on public.invoices
  for each row execute function public.prevent_actor_reassignment();

create or replace function public.can_manage_invoices(p_organization_id uuid)
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

create or replace function public.allocate_invoice_number(
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

  insert into public.invoice_number_counters as counters (organization_id, year, last_value)
  values (p_organization_id, p_year, 1)
  on conflict (organization_id, year)
  do update set last_value = counters.last_value + 1
  returning last_value into v_next;

  return 'OMX-INV-' || p_year::text || '-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.invoice_number := public.allocate_invoice_number(
      new.organization_id,
      extract(year from new.issue_date)::integer
    );
    return new;
  end if;

  if new.invoice_number is distinct from old.invoice_number then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger invoices_assign_number
  before insert or update on public.invoices
  for each row execute function public.assign_invoice_number();

create or replace function public.invoice_is_draft(p_organization_id uuid, p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff(p_organization_id)
    and exists (
      select 1
      from public.invoices as invoice
      where invoice.organization_id = p_organization_id
        and invoice.id = p_invoice_id
        and invoice.status = 'draft'::public.invoice_status
    );
$$;

create or replace function public.apply_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subtotal numeric(14, 2);
  v_discount numeric(14, 2);
  v_tax numeric(14, 2);
  v_paid numeric(14, 2);
begin
  select coalesce(sum(item.line_total), 0)
    into v_subtotal
  from public.invoice_items as item
  where item.organization_id = new.organization_id
    and item.invoice_id = new.id;

  if new.discount_type is null or new.discount_value is null then
    new.discount_type := null;
    new.discount_value := null;
    v_discount := 0;
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

  select coalesce(sum(payment.amount), 0)
    into v_paid
  from public.payments as payment
  where payment.organization_id = new.organization_id
    and payment.invoice_id = new.id;

  new.subtotal := v_subtotal;
  new.discount_amount := v_discount;
  new.tax_amount := case
    when new.tax_percent is null then 0
    else round((v_subtotal - v_discount) * new.tax_percent / 100, 2)
  end;
  v_tax := new.tax_amount;
  new.total := v_subtotal - v_discount + v_tax;
  new.amount_paid := v_paid;
  new.balance_due := greatest(new.total - v_paid, 0);
  return new;
end;
$$;

create trigger invoices_apply_totals
  before insert or update on public.invoices
  for each row execute function public.apply_invoice_totals();

create or replace function public.enforce_invoice_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items integer;
  v_paid numeric(14, 2);
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft'::public.invoice_status then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft'::public.invoice_status then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    new.issued_at := null;
    new.paid_at := null;
    return new;
  end if;

  if old.status = 'void'::public.invoice_status or old.status = 'paid'::public.invoice_status then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  select coalesce(sum(payment.amount), 0)
    into v_paid
  from public.payments as payment
  where payment.organization_id = new.organization_id
    and payment.invoice_id = new.id;

  if new.amount_paid is distinct from v_paid then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if old.status = 'draft'::public.invoice_status then
    if new.status not in ('draft'::public.invoice_status, 'issued'::public.invoice_status) then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    if new.status = 'issued'::public.invoice_status then
      select count(*) into v_items
      from public.invoice_items as item
      where item.organization_id = new.organization_id
        and item.invoice_id = new.id;
      if v_items < 1 then
        raise exception 'You do not have access.' using errcode = '22023';
      end if;
      new.issued_at := coalesce(old.issued_at, now());
    end if;
    return new;
  end if;

  if new.title is distinct from old.title
     or new.client_id is distinct from old.client_id
     or new.project_id is distinct from old.project_id
     or new.proposal_id is distinct from old.proposal_id
     or new.currency is distinct from old.currency
     or new.recipient_name is distinct from old.recipient_name
     or new.recipient_company is distinct from old.recipient_company
     or new.recipient_email is distinct from old.recipient_email
     or new.recipient_phone is distinct from old.recipient_phone
     or new.recipient_address is distinct from old.recipient_address
     or new.notes is distinct from old.notes
     or new.terms is distinct from old.terms
     or new.internal_notes is distinct from old.internal_notes
     or new.issue_date is distinct from old.issue_date
     or new.due_date is distinct from old.due_date
     or new.discount_type is distinct from old.discount_type
     or new.discount_value is distinct from old.discount_value
     or new.tax_percent is distinct from old.tax_percent
     or new.subtotal is distinct from old.subtotal
     or new.total is distinct from old.total then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if old.status = 'issued'::public.invoice_status and new.status = 'void'::public.invoice_status then
    if v_paid <> 0 then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'partially_paid'::public.invoice_status then
    if v_paid <= 0 or v_paid >= new.total then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    new.paid_at := null;
    return new;
  end if;

  if new.status = 'paid'::public.invoice_status then
    -- Paid means payments sum to a positive total. A zero-total invoice
    -- stays issued: balance is 0, it is not outstanding, a positive payment
    -- is rejected, and it can still be voided while unpaid. paid_at is
    -- assigned only here.
    if new.total <= 0 or v_paid <> new.total then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    new.paid_at := coalesce(old.paid_at, now());
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger invoices_enforce_lifecycle
  before insert or update or delete on public.invoices
  for each row execute function public.enforce_invoice_lifecycle();

create or replace function public.prepare_invoice_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.invoice_is_draft(new.organization_id, new.invoice_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  new.line_total := round(new.quantity * new.unit_price, 2);
  return new;
end;
$$;

create trigger invoice_items_prepare
  before insert or update on public.invoice_items
  for each row execute function public.prepare_invoice_item();

create or replace function public.refresh_invoice_from_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice uuid;
  v_org uuid;
begin
  v_invoice := coalesce(new.invoice_id, old.invoice_id);
  v_org := coalesce(new.organization_id, old.organization_id);
  update public.invoices
  set updated_at = now()
  where id = v_invoice
    and organization_id = v_org;
  return null;
end;
$$;

create trigger invoice_items_refresh
  after insert or update or delete on public.invoice_items
  for each row execute function public.refresh_invoice_from_items();

create or replace function public.enforce_invoice_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_client uuid;
  v_proposal_client uuid;
  v_proposal_status public.proposal_status;
  v_converted uuid;
begin
  if new.project_id is not null then
    select project.client_id into v_project_client
    from public.projects as project
    where project.id = new.project_id
      and project.organization_id = new.organization_id;
    if v_project_client is distinct from new.client_id then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
  end if;

  if new.proposal_id is not null then
    select proposal.client_id, proposal.status
      into v_proposal_client, v_proposal_status
    from public.proposals as proposal
    where proposal.id = new.proposal_id
      and proposal.organization_id = new.organization_id;
    if v_proposal_status is distinct from 'accepted'::public.proposal_status then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
    if v_proposal_client is null then
      select lead.converted_client_id into v_converted
      from public.proposals as proposal
      join public.leads as lead
        on lead.id = proposal.lead_id
       and lead.organization_id = proposal.organization_id
      where proposal.id = new.proposal_id
        and proposal.organization_id = new.organization_id;
      v_proposal_client := v_converted;
    end if;
    if v_proposal_client is distinct from new.client_id then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger invoices_enforce_context
  before insert or update on public.invoices
  for each row execute function public.enforce_invoice_context();

create or replace function public.guard_invoice_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.invoices as invoice
    where invoice.id = old.invoice_id
      and invoice.organization_id = old.organization_id
  ) then
    return old;
  end if;
  if not public.invoice_is_draft(old.organization_id, old.invoice_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger invoice_items_guard_delete
  before delete on public.invoice_items
  for each row execute function public.guard_invoice_item_delete();

create or replace function public.save_draft_invoice(
  p_organization_id uuid,
  p_invoice_id uuid,
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
  v_client_id uuid;
  v_project_id uuid;
  v_proposal_id uuid;
  v_issue_date date;
  v_due_date date;
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
  if not public.can_manage_invoices(p_organization_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  v_title := nullif(trim(coalesce(p_payload ->> 'title', '')), '');
  v_client_id := nullif(p_payload ->> 'client_id', '')::uuid;
  v_project_id := nullif(p_payload ->> 'project_id', '')::uuid;
  v_proposal_id := nullif(p_payload ->> 'proposal_id', '')::uuid;
  v_issue_date := (p_payload ->> 'issue_date')::date;
  v_due_date := (p_payload ->> 'due_date')::date;
  v_currency := upper(trim(coalesce(p_payload ->> 'currency', '')));

  if v_title is null or char_length(v_title) > 160
     or v_client_id is null
     or v_issue_date is null
     or v_due_date is null
     or v_due_date < v_issue_date
     or v_currency !~ '^[A-Z]{3}$'
     or nullif(trim(coalesce(p_payload ->> 'recipient_name', '')), '') is null
     or not exists (
       select 1 from public.clients as client
       where client.id = v_client_id and client.organization_id = p_organization_id
     ) then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  if v_proposal_id is not null and not exists (
    select 1
    from public.proposals as proposal
    where proposal.id = v_proposal_id
      and proposal.organization_id = p_organization_id
      and proposal.status = 'accepted'::public.proposal_status
  ) then
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

  if p_invoice_id is null then
    insert into public.invoices (
      organization_id, client_id, project_id, proposal_id, title, status,
      issue_date, due_date, currency, recipient_name, recipient_company,
      recipient_email, recipient_phone, recipient_address, notes, terms,
      internal_notes, discount_type, discount_value, tax_percent, created_by
    ) values (
      p_organization_id, v_client_id, v_project_id, v_proposal_id, v_title,
      'draft'::public.invoice_status, v_issue_date, v_due_date, v_currency,
      trim(p_payload ->> 'recipient_name'),
      nullif(trim(coalesce(p_payload ->> 'recipient_company', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'recipient_email', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'recipient_phone', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'recipient_address', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'notes', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'terms', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'internal_notes', '')), ''),
      null, null, null, v_user_id
    )
    returning id into v_id;
  else
    select invoice.id into v_id
    from public.invoices as invoice
    where invoice.id = p_invoice_id
      and invoice.organization_id = p_organization_id
      and invoice.status = 'draft'::public.invoice_status
    for update;
    if v_id is null then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;

    update public.invoices
    set client_id = v_client_id,
        project_id = v_project_id,
        proposal_id = v_proposal_id,
        title = v_title,
        issue_date = v_issue_date,
        due_date = v_due_date,
        currency = v_currency,
        recipient_name = trim(p_payload ->> 'recipient_name'),
        recipient_company = nullif(trim(coalesce(p_payload ->> 'recipient_company', '')), ''),
        recipient_email = nullif(trim(coalesce(p_payload ->> 'recipient_email', '')), ''),
        recipient_phone = nullif(trim(coalesce(p_payload ->> 'recipient_phone', '')), ''),
        recipient_address = nullif(trim(coalesce(p_payload ->> 'recipient_address', '')), ''),
        notes = nullif(trim(coalesce(p_payload ->> 'notes', '')), ''),
        terms = nullif(trim(coalesce(p_payload ->> 'terms', '')), ''),
        internal_notes = nullif(trim(coalesce(p_payload ->> 'internal_notes', '')), ''),
        discount_type = null,
        discount_value = null,
        tax_percent = null
    where id = v_id and organization_id = p_organization_id;

    delete from public.invoice_items
    where organization_id = p_organization_id and invoice_id = v_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_payload -> 'items')
  loop
    if nullif(trim(coalesce(v_item ->> 'description', '')), '') is null
       or coalesce((v_item ->> 'quantity')::numeric, 0) <= 0
       or coalesce((v_item ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'You do not have access.' using errcode = '22023';
    end if;
    insert into public.invoice_items (
      organization_id, invoice_id, sort_order, description, quantity, unit_price
    ) values (
      p_organization_id,
      v_id,
      v_index,
      trim(v_item ->> 'description'),
      round((v_item ->> 'quantity')::numeric, 2),
      round((v_item ->> 'unit_price')::numeric, 2)
    );
    v_index := v_index + 1;
  end loop;

  update public.invoices
  set discount_type = v_discount_type,
      discount_value = v_discount_value,
      tax_percent = v_tax_percent
  where id = v_id and organization_id = p_organization_id;

  return v_id;
end;
$$;

create or replace function public.issue_invoice(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.can_manage_invoices(p_organization_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  select invoice.id into v_id
  from public.invoices as invoice
  where invoice.id = p_invoice_id
    and invoice.organization_id = p_organization_id
    and invoice.status = 'draft'::public.invoice_status
  for update;

  if v_id is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  update public.invoices
  set status = 'issued'::public.invoice_status
  where id = v_id
    and organization_id = p_organization_id
    and status = 'draft'::public.invoice_status;

  if not found then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  return 'issued';
end;
$$;

create or replace function public.void_invoice(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.can_manage_invoices(p_organization_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  select invoice.id into v_id
  from public.invoices as invoice
  where invoice.id = p_invoice_id
    and invoice.organization_id = p_organization_id
    and invoice.status = 'issued'::public.invoice_status
    and invoice.amount_paid = 0
  for update;

  if v_id is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  update public.invoices
  set status = 'void'::public.invoice_status
  where id = v_id and organization_id = p_organization_id;

  return 'void';
end;
$$;

create or replace function public.record_invoice_payment(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice public.invoices;
  v_paid numeric(14, 2);
  v_payment_id uuid;
  v_method public.payment_method;
begin
  if v_user_id is null or not public.can_manage_invoices(p_organization_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_payment_date is null then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  begin
    v_method := p_method::public.payment_method;
  exception
    when invalid_text_representation then
      raise exception 'You do not have access.' using errcode = '22023';
  end;

  select * into v_invoice
  from public.invoices as invoice
  where invoice.id = p_invoice_id
    and invoice.organization_id = p_organization_id
  for update;

  if not found or v_invoice.status not in (
    'issued'::public.invoice_status,
    'partially_paid'::public.invoice_status
  ) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  select coalesce(sum(payment.amount), 0) into v_paid
  from public.payments as payment
  where payment.organization_id = p_organization_id
    and payment.invoice_id = p_invoice_id;

  if round(p_amount, 2) > (v_invoice.total - v_paid) then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  insert into public.payments (
    organization_id, invoice_id, amount, payment_date, payment_method, reference, notes, recorded_by
  ) values (
    p_organization_id,
    p_invoice_id,
    round(p_amount, 2),
    p_payment_date,
    v_method,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_payment_id;

  -- One invoice update. Totals are recomputed in the same statement, before
  -- the lifecycle trigger sees the new status. A preliminary touch update
  -- would leave a final payment on a partially paid invoice with
  -- amount_paid = total while status is still partially_paid, which the
  -- lifecycle rejects. The row lock is held until commit, so a second
  -- payment (for example 50 after 70 on a 100 total) reads the new sum.
  select coalesce(sum(payment.amount), 0) into v_paid
  from public.payments as payment
  where payment.organization_id = p_organization_id
    and payment.invoice_id = p_invoice_id;

  update public.invoices
  set status = case
    when v_paid = total then 'paid'::public.invoice_status
    else 'partially_paid'::public.invoice_status
  end
  where id = p_invoice_id
    and organization_id = p_organization_id
    and status in (
      'issued'::public.invoice_status,
      'partially_paid'::public.invoice_status
    );

  if not found then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  return v_payment_id;
end;
$$;

create or replace function public.client_can_read_invoice(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invoices as invoice
    where invoice.id = p_invoice_id
      and invoice.status <> 'draft'::public.invoice_status
      and public.client_mapped_to(invoice.organization_id, invoice.client_id)
  );
$$;

create or replace function public.portal_invoices(p_organization_id uuid)
returns table (
  id uuid,
  invoice_number text,
  title text,
  status public.invoice_status,
  issue_date date,
  due_date date,
  currency char(3),
  total numeric,
  amount_paid numeric,
  balance_due numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    invoice.id,
    invoice.invoice_number,
    invoice.title,
    invoice.status,
    invoice.issue_date,
    invoice.due_date,
    invoice.currency,
    invoice.total,
    invoice.amount_paid,
    invoice.balance_due
  from public.invoices as invoice
  where invoice.organization_id = p_organization_id
    and public.client_can_read_invoice(invoice.id)
  order by invoice.issue_date desc, invoice.invoice_number desc;
$$;

create or replace function public.portal_invoice(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns table (
  id uuid,
  invoice_number text,
  title text,
  status public.invoice_status,
  issue_date date,
  due_date date,
  currency char(3),
  recipient_name text,
  recipient_company text,
  notes text,
  terms text,
  subtotal numeric,
  discount_amount numeric,
  tax_amount numeric,
  total numeric,
  amount_paid numeric,
  balance_due numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    invoice.id,
    invoice.invoice_number,
    invoice.title,
    invoice.status,
    invoice.issue_date,
    invoice.due_date,
    invoice.currency,
    invoice.recipient_name,
    invoice.recipient_company,
    invoice.notes,
    invoice.terms,
    invoice.subtotal,
    invoice.discount_amount,
    invoice.tax_amount,
    invoice.total,
    invoice.amount_paid,
    invoice.balance_due
  from public.invoices as invoice
  where invoice.id = p_invoice_id
    and invoice.organization_id = p_organization_id
    and public.client_can_read_invoice(invoice.id);
$$;

create or replace function public.portal_invoice_items(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns table (
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
  select item.description, item.quantity, item.unit_price, item.line_total, item.sort_order
  from public.invoice_items as item
  where item.organization_id = p_organization_id
    and item.invoice_id = p_invoice_id
    and public.client_can_read_invoice(p_invoice_id);
$$;

create or replace function public.portal_invoice_payments(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns table (
  amount numeric,
  payment_date date,
  payment_method public.payment_method,
  reference text
)
language sql
stable
security definer
set search_path = public
as $$
  select payment.amount, payment.payment_date, payment.payment_method, payment.reference
  from public.payments as payment
  where payment.organization_id = p_organization_id
    and payment.invoice_id = p_invoice_id
    and public.client_can_read_invoice(p_invoice_id)
  order by payment.payment_date, payment.created_at;
$$;

revoke all on function public.can_manage_invoices(uuid) from public, anon;
revoke all on function public.allocate_invoice_number(uuid, integer) from public, anon, authenticated;
revoke all on function public.assign_invoice_number() from public, anon, authenticated;
revoke all on function public.invoice_is_draft(uuid, uuid) from public, anon;
revoke all on function public.apply_invoice_totals() from public, anon, authenticated;
revoke all on function public.enforce_invoice_lifecycle() from public, anon, authenticated;
revoke all on function public.prepare_invoice_item() from public, anon, authenticated;
revoke all on function public.refresh_invoice_from_items() from public, anon, authenticated;
revoke all on function public.enforce_invoice_context() from public, anon, authenticated;
revoke all on function public.guard_invoice_item_delete() from public, anon, authenticated;
revoke all on function public.save_draft_invoice(uuid, uuid, jsonb) from public, anon;
revoke all on function public.issue_invoice(uuid, uuid) from public, anon;
revoke all on function public.void_invoice(uuid, uuid) from public, anon;
revoke all on function public.record_invoice_payment(uuid, uuid, numeric, date, text, text, text) from public, anon;
revoke all on function public.client_can_read_invoice(uuid) from public, anon, authenticated;
revoke all on function public.portal_invoices(uuid) from public, anon;
revoke all on function public.portal_invoice(uuid, uuid) from public, anon;
revoke all on function public.portal_invoice_items(uuid, uuid) from public, anon;
revoke all on function public.portal_invoice_payments(uuid, uuid) from public, anon;

grant execute on function public.can_manage_invoices(uuid) to authenticated;
grant execute on function public.invoice_is_draft(uuid, uuid) to authenticated;
grant execute on function public.save_draft_invoice(uuid, uuid, jsonb) to authenticated;
grant execute on function public.issue_invoice(uuid, uuid) to authenticated;
grant execute on function public.void_invoice(uuid, uuid) to authenticated;
grant execute on function public.record_invoice_payment(uuid, uuid, numeric, date, text, text, text) to authenticated;
grant execute on function public.portal_invoices(uuid) to authenticated;
grant execute on function public.portal_invoice(uuid, uuid) to authenticated;
grant execute on function public.portal_invoice_items(uuid, uuid) to authenticated;
grant execute on function public.portal_invoice_payments(uuid, uuid) to authenticated;

revoke all on table public.invoice_number_counters from public, anon, authenticated;
revoke all on table public.invoices from public, anon, authenticated;
revoke all on table public.invoice_items from public, anon, authenticated;
revoke all on table public.payments from public, anon, authenticated;

alter table public.invoice_number_counters enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.invoice_number_counters force row level security;
alter table public.invoices force row level security;
alter table public.invoice_items force row level security;
alter table public.payments force row level security;

-- Header writes, item replacement, issuing, voiding, and payments go through
-- owner functions. authenticated keeps draft delete, which RLS and the
-- lifecycle trigger both limit to managers and drafts.
grant select, delete on table public.invoices to authenticated;
grant select on table public.invoice_items to authenticated;
grant select on table public.payments to authenticated;

create policy invoices_select_staff
  on public.invoices for select to authenticated
  using (public.is_staff(organization_id));

create policy invoices_insert_managers
  on public.invoices for insert to authenticated
  with check (
    public.can_manage_invoices(organization_id)
    and created_by = auth.uid()
    and status = 'draft'::public.invoice_status
  );

create policy invoices_update_managers
  on public.invoices for update to authenticated
  using (public.can_manage_invoices(organization_id))
  with check (public.can_manage_invoices(organization_id));

create policy invoices_delete_draft
  on public.invoices for delete to authenticated
  using (
    public.can_manage_invoices(organization_id)
    and status = 'draft'::public.invoice_status
  );

create policy invoice_items_select_staff
  on public.invoice_items for select to authenticated
  using (public.is_staff(organization_id));

create policy invoice_items_write_draft
  on public.invoice_items for insert to authenticated
  with check (
    public.can_manage_invoices(organization_id)
    and public.invoice_is_draft(organization_id, invoice_id)
  );

create policy invoice_items_update_draft
  on public.invoice_items for update to authenticated
  using (
    public.can_manage_invoices(organization_id)
    and public.invoice_is_draft(organization_id, invoice_id)
  )
  with check (
    public.can_manage_invoices(organization_id)
    and public.invoice_is_draft(organization_id, invoice_id)
  );

create policy invoice_items_delete_draft
  on public.invoice_items for delete to authenticated
  using (
    public.can_manage_invoices(organization_id)
    and public.invoice_is_draft(organization_id, invoice_id)
  );

create policy payments_select_staff
  on public.payments for select to authenticated
  using (public.is_staff(organization_id));

