-- Phase 7: in-app notifications and email delivery records.
-- Does not edit Phase 1–6 objects in place. Lifecycle RPCs stay as applied.
-- Triggers observe successful row changes in the same transaction.
-- External email is not sent from PostgreSQL.

create type public.notification_type as enum (
  'proposal_sent',
  'proposal_accepted',
  'proposal_rejected',
  'invoice_issued',
  'payment_recorded',
  'task_assigned'
);

create type public.email_delivery_status as enum (
  'pending',
  'sent',
  'failed'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  type public.notification_type not null,
  title text not null,
  message text not null,
  href text not null,
  is_read boolean not null default false,
  read_at timestamptz,
  event_key text not null,
  created_at timestamptz not null default now(),
  constraint notifications_member_fkey
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id)
    on delete cascade,
  constraint notifications_event_key unique (organization_id, user_id, event_key),
  constraint notifications_title_len check (char_length(title) between 1 and 140),
  constraint notifications_message_len check (char_length(message) between 1 and 500),
  constraint notifications_event_key_len check (char_length(event_key) between 1 and 160),
  constraint notifications_href_internal check (
    href ~ '^/(dashboard|portal)(/[a-z0-9][a-z0-9-]*){1,4}$'
  ),
  constraint notifications_read_consistency check (
    (is_read = false and read_at is null)
    or (is_read = true and read_at is not null)
  )
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where is_read = false;

create index notifications_org_user_created_idx
  on public.notifications (organization_id, user_id, created_at desc);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_email text not null,
  template text not null,
  related_entity_type text not null,
  related_entity_id uuid not null,
  event_key text not null,
  provider text,
  provider_message_id text,
  status public.email_delivery_status not null default 'pending',
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint email_deliveries_event_key unique (organization_id, event_key),
  constraint email_deliveries_template_check check (
    template in ('invitation', 'proposal_available', 'invoice_issued', 'payment_recorded')
  ),
  constraint email_deliveries_email_safe check (
    char_length(recipient_email) between 3 and 200
    and recipient_email !~ '[[:space:]]'
    and recipient_email like '%@%'
  ),
  constraint email_deliveries_error_len check (error_code is null or char_length(error_code) <= 40),
  constraint email_deliveries_provider_len check (
    provider is null or provider in ('resend')
  ),
  constraint email_deliveries_message_id_len check (
    provider_message_id is null
    or provider_message_id ~ '^[A-Za-z0-9_-]{1,80}$'
  )
);

create index email_deliveries_org_created_idx
  on public.email_deliveries (organization_id, created_at desc);

create or replace function public.enqueue_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_client_id uuid,
  p_type public.notification_type,
  p_title text,
  p_message text,
  p_href text,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.org_role;
begin
  if p_href is null or p_href !~ '^/(dashboard|portal)(/[a-z0-9][a-z0-9-]*){1,4}$' then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  select member.role into v_role
  from public.organization_members as member
  where member.organization_id = p_organization_id
    and member.user_id = p_user_id;

  if v_role is null then
    return;
  end if;

  if p_type in (
    'proposal_sent'::public.notification_type,
    'invoice_issued'::public.notification_type,
    'payment_recorded'::public.notification_type
  ) then
    if v_role <> 'client'::public.org_role or p_href not like '/portal/%' or p_client_id is null then
      return;
    end if;
    if not exists (
      select 1 from public.client_users as link
      where link.organization_id = p_organization_id
        and link.client_id = p_client_id
        and link.user_id = p_user_id
    ) then
      return;
    end if;
  elsif p_type in (
    'proposal_accepted'::public.notification_type,
    'proposal_rejected'::public.notification_type
  ) then
    if v_role not in ('owner'::public.org_role, 'admin'::public.org_role)
       or p_href not like '/dashboard/%' then
      return;
    end if;
  elsif p_type = 'task_assigned'::public.notification_type then
    if v_role = 'client'::public.org_role or p_href not like '/dashboard/%' then
      return;
    end if;
  else
    return;
  end if;

  insert into public.notifications (
    organization_id, user_id, type, title, message, href, event_key
  ) values (
    p_organization_id, p_user_id, p_type, p_title, p_message, p_href, p_event_key
  )
  on conflict (organization_id, user_id, event_key) do nothing;
end;
$$;

create or replace function public.notify_client_users(
  p_organization_id uuid,
  p_client_id uuid,
  p_type public.notification_type,
  p_title text,
  p_message text,
  p_href text,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  for v_user in
    select link.user_id
    from public.client_users as link
    where link.organization_id = p_organization_id
      and link.client_id = p_client_id
  loop
    perform public.enqueue_notification(
      p_organization_id, v_user, p_client_id, p_type, p_title, p_message, p_href, p_event_key
    );
  end loop;
end;
$$;

create or replace function public.notify_owners_and_admins(
  p_organization_id uuid,
  p_type public.notification_type,
  p_title text,
  p_message text,
  p_href text,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  for v_user in
    select member.user_id
    from public.organization_members as member
    where member.organization_id = p_organization_id
      and member.role in ('owner'::public.org_role, 'admin'::public.org_role)
  loop
    perform public.enqueue_notification(
      p_organization_id, v_user, null, p_type, p_title, p_message, p_href, p_event_key
    );
  end loop;
end;
$$;

create or replace function public.enqueue_email(
  p_organization_id uuid,
  p_recipient text,
  p_template text,
  p_entity_type text,
  p_entity_id uuid,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null or p_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    return;
  end if;
  insert into public.email_deliveries (
    organization_id, recipient_email, template, related_entity_type, related_entity_id, event_key
  ) values (
    p_organization_id, lower(p_recipient), p_template, p_entity_type, p_entity_id, p_event_key
  )
  on conflict (organization_id, event_key) do nothing;
end;
$$;

create or replace function public.portal_email_matches(
  p_organization_id uuid,
  p_client_id uuid,
  p_email text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_email is not null and exists (
    select 1
    from public.client_users as link
    join public.profiles as profile on profile.id = link.user_id
    where link.organization_id = p_organization_id
      and link.client_id = p_client_id
      and lower(profile.email) = lower(p_email)
  );
$$;

create or replace function public.proposal_client_id(p_organization_id uuid, p_proposal public.proposals)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_client uuid;
begin
  v_client := p_proposal.client_id;
  if v_client is null and p_proposal.lead_id is not null then
    select lead.converted_client_id into v_client
    from public.leads as lead
    where lead.id = p_proposal.lead_id
      and lead.organization_id = p_organization_id;
  end if;
  return v_client;
end;
$$;

create or replace function public.notify_proposal_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_key text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.status = 'draft'::public.proposal_status and new.status = 'sent'::public.proposal_status then
    v_client := public.proposal_client_id(new.organization_id, new);
    v_key := 'proposal_sent:' || new.id::text;
    if v_client is not null then
      perform public.notify_client_users(
        new.organization_id,
        v_client,
        'proposal_sent'::public.notification_type,
        'Proposal available',
        left(new.proposal_number || ' · ' || new.title, 500),
        '/portal/proposals/' || new.id::text,
        v_key
      );
      if public.portal_email_matches(new.organization_id, v_client, new.recipient_email) then
        perform public.enqueue_email(
          new.organization_id,
          new.recipient_email,
          'proposal_available',
          'proposal',
          new.id,
          v_key
        );
      end if;
    end if;
  elsif old.status = 'sent'::public.proposal_status
    and new.status in ('accepted'::public.proposal_status, 'rejected'::public.proposal_status) then
    v_key := 'proposal_' || new.status::text || ':' || new.id::text;
    perform public.notify_owners_and_admins(
      new.organization_id,
      case
        when new.status = 'accepted'::public.proposal_status then 'proposal_accepted'::public.notification_type
        else 'proposal_rejected'::public.notification_type
      end,
      case when new.status = 'accepted'::public.proposal_status then 'Proposal accepted' else 'Proposal rejected' end,
      left(new.proposal_number || ' · ' || new.title, 500),
      '/dashboard/proposals/' || new.id::text,
      v_key
    );
  end if;

  return new;
end;
$$;

create trigger proposals_notify_transition
  after update of status on public.proposals
  for each row execute function public.notify_proposal_transition();

create or replace function public.notify_invoice_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_amount text;
  v_paid text;
begin
  if old.status = 'draft'::public.invoice_status and new.status = 'issued'::public.invoice_status then
    v_key := 'invoice_issued:' || new.id::text;
    v_amount := new.currency || ' ' || trim(to_char(new.total, 'FM999999999990.00'));
    perform public.notify_client_users(
      new.organization_id,
      new.client_id,
      'invoice_issued'::public.notification_type,
      'Invoice issued',
      left(new.invoice_number || ' · ' || v_amount || ' · due ' || new.due_date::text, 500),
      '/portal/invoices/' || new.id::text,
      v_key
    );
    if public.portal_email_matches(new.organization_id, new.client_id, new.recipient_email) then
      perform public.enqueue_email(
        new.organization_id, new.recipient_email, 'invoice_issued', 'invoice', new.id, v_key
      );
    end if;
  elsif new.amount_paid > old.amount_paid
    and new.status in ('partially_paid'::public.invoice_status, 'paid'::public.invoice_status) then
    v_paid := trim(to_char(new.amount_paid, 'FM999999999990.00'));
    v_key := 'payment:' || new.id::text || ':' || v_paid;
    v_amount := new.currency || ' ' || trim(to_char(new.amount_paid - old.amount_paid, 'FM999999999990.00'));
    perform public.notify_client_users(
      new.organization_id,
      new.client_id,
      'payment_recorded'::public.notification_type,
      'Payment recorded',
      left(
        new.invoice_number || ' · ' || v_amount
        || ' · balance ' || new.currency || ' ' || trim(to_char(new.balance_due, 'FM999999999990.00')),
        500
      ),
      '/portal/invoices/' || new.id::text,
      v_key
    );
    if public.portal_email_matches(new.organization_id, new.client_id, new.recipient_email) then
      perform public.enqueue_email(
        new.organization_id, new.recipient_email, 'payment_recorded', 'invoice', new.id, v_key
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger invoices_notify_transition
  after update on public.invoices
  for each row execute function public.notify_invoice_transition();

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;
  if new.assigned_to = auth.uid() then
    return new;
  end if;
  perform public.enqueue_notification(
    new.organization_id,
    new.assigned_to,
    null,
    'task_assigned'::public.notification_type,
    'Task assigned',
    left(new.title, 500),
    '/dashboard/projects/' || new.project_id::text,
    'task_assigned:' || new.id::text || ':' || new.assigned_to::text
  );
  return new;
end;
$$;

create trigger tasks_notify_assignment
  after insert or update of assigned_to on public.tasks
  for each row execute function public.notify_task_assignment();

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = v_user
    and is_read = false;
  return found;
end;
$$;

create or replace function public.mark_all_notifications_read(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null or not public.is_org_member(p_organization_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where organization_id = p_organization_id
    and user_id = v_user
    and is_read = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.claim_pending_emails(
  p_organization_id uuid,
  p_template text,
  p_entity_id uuid
)
returns table (
  id uuid,
  recipient_email text,
  template text,
  summary text,
  action_path text,
  organization_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.email_deliveries;
  v_summary text;
  v_path text;
  v_org_name text;
begin
  if auth.uid() is null or p_template not in ('proposal_available', 'invoice_issued', 'payment_recorded') then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  if p_template = 'proposal_available' and not public.can_manage_proposals(p_organization_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  if p_template in ('invoice_issued', 'payment_recorded') and not public.can_manage_invoices(p_organization_id) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  select organization.name into v_org_name
  from public.organizations as organization
  where organization.id = p_organization_id;

  for v_row in
    select delivery.*
    from public.email_deliveries as delivery
    where delivery.organization_id = p_organization_id
      and delivery.template = p_template
      and delivery.related_entity_id = p_entity_id
      and delivery.status = 'pending'::public.email_delivery_status
      and delivery.error_code is null
    for update
  loop
    if p_template = 'proposal_available' then
      select
        proposal.proposal_number || ' · ' || proposal.title,
        '/portal/proposals/' || proposal.id::text
      into v_summary, v_path
      from public.proposals as proposal
      where proposal.id = v_row.related_entity_id
        and proposal.organization_id = p_organization_id
        and proposal.status = 'sent'::public.proposal_status
        and lower(proposal.recipient_email) = v_row.recipient_email;
    elsif p_template = 'invoice_issued' then
      select
        invoice.invoice_number || ' · ' || invoice.currency || ' ' || trim(to_char(invoice.total, 'FM999999999990.00'))
          || ' · due ' || invoice.due_date::text,
        '/portal/invoices/' || invoice.id::text
      into v_summary, v_path
      from public.invoices as invoice
      where invoice.id = v_row.related_entity_id
        and invoice.organization_id = p_organization_id
        and invoice.status = 'issued'::public.invoice_status
        and lower(invoice.recipient_email) = v_row.recipient_email;
    else
      select
        invoice.invoice_number || ' · paid ' || invoice.currency || ' '
          || trim(to_char(invoice.amount_paid, 'FM999999999990.00'))
          || ' · balance ' || invoice.currency || ' '
          || trim(to_char(invoice.balance_due, 'FM999999999990.00')),
        '/portal/invoices/' || invoice.id::text
      into v_summary, v_path
      from public.invoices as invoice
      where invoice.id = v_row.related_entity_id
        and invoice.organization_id = p_organization_id
        and lower(invoice.recipient_email) = v_row.recipient_email;
    end if;

    if v_summary is null or v_path is null then
      update public.email_deliveries
      set status = 'failed'::public.email_delivery_status,
          error_code = 'not_deliverable'
      where id = v_row.id;
      continue;
    end if;

    update public.email_deliveries
    set error_code = 'in_progress'
    where id = v_row.id
      and status = 'pending'::public.email_delivery_status;

    id := v_row.id;
    recipient_email := v_row.recipient_email;
    template := v_row.template;
    summary := v_summary;
    action_path := v_path;
    organization_name := coalesce(v_org_name, 'Organization');
    return next;
  end loop;
end;
$$;

create or replace function public.complete_email_delivery(
  p_delivery_id uuid,
  p_status text,
  p_provider_message_id text,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_template text;
  v_entity uuid;
  v_role public.org_role;
begin
  if auth.uid() is null or p_status not in ('sent', 'failed') then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  if p_error_code is not null and (
    char_length(p_error_code) > 40
    or p_error_code !~ '^[a-z0-9_]{1,40}$'
  ) then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;
  if p_provider_message_id is not null and p_provider_message_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  select delivery.organization_id, delivery.template, delivery.related_entity_id
    into v_org, v_template, v_entity
  from public.email_deliveries as delivery
  where delivery.id = p_delivery_id
    and delivery.status = 'pending'::public.email_delivery_status
    and delivery.error_code = 'in_progress';

  if v_org is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  if v_template = 'proposal_available' and not public.can_manage_proposals(v_org) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  if v_template in ('invoice_issued', 'payment_recorded') and not public.can_manage_invoices(v_org) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  if v_template = 'invitation' then
    select invitation.role into v_role
    from public.invitations as invitation
    where invitation.id = v_entity
      and invitation.organization_id = v_org;
    if v_role = 'client'::public.org_role then
      if not public.has_org_role(
        v_org,
        array['owner'::public.org_role, 'admin'::public.org_role, 'project_manager'::public.org_role]
      ) then
        raise exception 'You do not have access.' using errcode = '42501';
      end if;
    elsif not public.has_org_role(
      v_org,
      array['owner'::public.org_role, 'admin'::public.org_role]
    ) then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
  end if;

  update public.email_deliveries
  set status = p_status::public.email_delivery_status,
      error_code = case when p_status = 'sent' then null else p_error_code end,
      provider = case when p_status = 'sent' then 'resend' else provider end,
      provider_message_id = case when p_status = 'sent' then p_provider_message_id else null end,
      sent_at = case when p_status = 'sent' then now() else null end
  where id = p_delivery_id;
end;
$$;

create or replace function public.rotate_invitation_token(
  p_organization_id uuid,
  p_invitation_id uuid,
  p_token_hash text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role public.org_role;
  v_client uuid;
begin
  if auth.uid() is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  select invitation.email, invitation.role, invitation.client_id
    into v_email, v_role, v_client
  from public.invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.organization_id = p_organization_id
    and invitation.accepted_at is null
    and invitation.expires_at > now()
  for update;

  if v_email is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if v_role = 'client'::public.org_role then
    if v_client is null or not public.has_org_role(
      p_organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role, 'project_manager'::public.org_role]
    ) then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
  elsif v_role in (
    'admin'::public.org_role,
    'project_manager'::public.org_role,
    'member'::public.org_role
  ) then
    if not public.has_org_role(
      p_organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role]
    ) then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
  else
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  update public.invitations
  set token_hash = p_token_hash
  where id = p_invitation_id
    and organization_id = p_organization_id
    and accepted_at is null
    and expires_at > now()
    and role = v_role
    and client_id is not distinct from v_client;

  if not found then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

create or replace function public.begin_invitation_email(
  p_organization_id uuid,
  p_invitation_id uuid,
  p_event_key text,
  p_token_hash text
)
returns table (
  delivery_id uuid,
  recipient_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role public.org_role;
  v_id uuid;
begin
  if auth.uid() is null
     or p_event_key is null
     or char_length(p_event_key) > 160
     or p_token_hash is null
     or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  select invitation.email, invitation.role
    into v_email, v_role
  from public.invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.organization_id = p_organization_id
    and invitation.token_hash = p_token_hash
    and invitation.accepted_at is null;

  if v_email is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  if v_role = 'client'::public.org_role then
    if not public.has_org_role(
      p_organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role, 'project_manager'::public.org_role]
    ) then
      raise exception 'You do not have access.' using errcode = '42501';
    end if;
  elsif not public.has_org_role(
    p_organization_id,
    array['owner'::public.org_role, 'admin'::public.org_role]
  ) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  insert into public.email_deliveries (
    organization_id, recipient_email, template, related_entity_type, related_entity_id, event_key, error_code
  ) values (
    p_organization_id, lower(v_email), 'invitation', 'invitation', p_invitation_id, p_event_key, 'in_progress'
  )
  on conflict (organization_id, event_key) do nothing
  returning id into v_id;

  if v_id is null then
    return;
  end if;
  delivery_id := v_id;
  recipient_email := lower(v_email);
  return next;
end;
$$;

create or replace function public.own_invitation_id(p_token_hash text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select invitation.id
  from public.invitations as invitation
  where invitation.token_hash = p_token_hash
    and invitation.invited_by = auth.uid()
    and invitation.accepted_at is null;
$$;

revoke all on function public.enqueue_notification(uuid, uuid, uuid, public.notification_type, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_client_users(uuid, uuid, public.notification_type, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_owners_and_admins(uuid, public.notification_type, text, text, text, text) from public, anon, authenticated;
revoke all on function public.enqueue_email(uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.portal_email_matches(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.proposal_client_id(uuid, public.proposals) from public, anon, authenticated;
revoke all on function public.notify_proposal_transition() from public, anon, authenticated;
revoke all on function public.notify_invoice_transition() from public, anon, authenticated;
revoke all on function public.notify_task_assignment() from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read(uuid) from public, anon;
revoke all on function public.claim_pending_emails(uuid, text, uuid) from public, anon;
revoke all on function public.complete_email_delivery(uuid, text, text, text) from public, anon;
revoke all on function public.rotate_invitation_token(uuid, uuid, text) from public, anon;
revoke all on function public.begin_invitation_email(uuid, uuid, text, text) from public, anon;
revoke all on function public.own_invitation_id(text) from public, anon;

grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
grant execute on function public.claim_pending_emails(uuid, text, uuid) to authenticated;
grant execute on function public.complete_email_delivery(uuid, text, text, text) to authenticated;
grant execute on function public.rotate_invitation_token(uuid, uuid, text) to authenticated;
grant execute on function public.begin_invitation_email(uuid, uuid, text, text) to authenticated;
grant execute on function public.own_invitation_id(text) to authenticated;

revoke all on table public.notifications from public, anon, authenticated;
revoke all on table public.email_deliveries from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant select on table public.email_deliveries to authenticated;

alter table public.notifications enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.notifications force row level security;
alter table public.email_deliveries force row level security;

create policy notifications_select_own
  on public.notifications for select to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id));

create policy email_deliveries_select_managers
  on public.email_deliveries for select to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['owner'::public.org_role, 'admin'::public.org_role, 'project_manager'::public.org_role]
    )
  );
