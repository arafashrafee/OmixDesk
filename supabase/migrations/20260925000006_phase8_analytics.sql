-- Phase 8: tenant-scoped report aggregates.
-- Authorization is owner, admin, or project manager. Members keep table
-- read from earlier phases; these functions do not give them totals.
-- Money is returned as text and grouped by currency. No dynamic SQL.

create or replace function public.organization_report_timezone(p_organization_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
begin
  select organization.timezone into v_timezone
  from public.organizations as organization
  where organization.id = p_organization_id;
  if v_timezone is null or char_length(v_timezone) = 0 then
    return 'UTC';
  end if;
  begin
    perform now() at time zone v_timezone;
  exception
    when invalid_parameter_value then
      return 'UTC';
  end;
  return v_timezone;
end;
$$;

create or replace function public.report_money(p_amount numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(to_char(coalesce(p_amount, 0), 'FM999999999990.00'));
$$;

create or replace function public.assert_report_reader(p_organization_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_organization_id is null then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  if not public.has_org_role(
    p_organization_id,
    array['owner'::public.org_role, 'admin'::public.org_role, 'project_manager'::public.org_role]
  ) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;
  return public.organization_report_timezone(p_organization_id);
end;
$$;

create or replace function public.assert_report_window(p_start date, p_end date)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if (p_start is null) <> (p_end is null) then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;
  if p_start is not null and (p_start > p_end or (p_end - p_start) > 3660) then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.report_overview(
  p_organization_id uuid,
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_today date;
  v_month date;
begin
  v_timezone := public.assert_report_reader(p_organization_id);
  perform public.assert_report_window(p_start, p_end);
  v_today := (now() at time zone v_timezone)::date;
  v_month := date_trunc('month', v_today::timestamp)::date;

  return jsonb_build_object(
    'today', v_today,
    'timezone', v_timezone,
    'period_leads_created', (
      select count(*) from public.leads as lead
      where lead.organization_id = p_organization_id
        and (p_start is null or (lead.created_at at time zone v_timezone)::date between p_start and p_end)
    ),
    'current_open_leads', (
      select count(*) from public.leads as lead
      where lead.organization_id = p_organization_id
        and lead.status not in ('won'::public.lead_status, 'lost'::public.lead_status)
    ),
    'followups_overdue', (
      select count(*) from public.leads as lead
      where lead.organization_id = p_organization_id
        and lead.status not in ('won'::public.lead_status, 'lost'::public.lead_status)
        and lead.next_follow_up_at is not null
        and (lead.next_follow_up_at at time zone v_timezone)::date < v_today
    ),
    'active_projects', (
      select count(*) from public.projects as project
      where project.organization_id = p_organization_id
        and project.status = 'active'::public.project_status
    ),
    'projects_due_soon', (
      select count(*) from public.projects as project
      where project.organization_id = p_organization_id
        and project.deadline between v_today and (v_today + 7)
        and project.status not in ('completed'::public.project_status, 'cancelled'::public.project_status)
    ),
    'accepted_proposals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'currency', money.currency,
        'amount', public.report_money(money.amount)
      ) order by money.currency), '[]'::jsonb)
      from (
        select proposal.currency, sum(proposal.total) as amount
        from public.proposals as proposal
        where proposal.organization_id = p_organization_id
          and proposal.status = 'accepted'::public.proposal_status
          and (p_start is null or proposal.issue_date between p_start and p_end)
        group by proposal.currency
      ) as money
    ),
    'billing_now', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'currency', money.currency,
        'outstanding', public.report_money(money.outstanding),
        'overdue', public.report_money(money.overdue),
        'collected_this_month', public.report_money(money.collected_this_month)
      ) order by money.currency), '[]'::jsonb)
      from (
        select
          invoice.currency,
          coalesce(sum(invoice.balance_due) filter (
            where invoice.status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status)
              and invoice.balance_due > 0
          ), 0) as outstanding,
          coalesce(sum(invoice.balance_due) filter (
            where invoice.status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status)
              and invoice.balance_due > 0
              and invoice.due_date < v_today
          ), 0) as overdue,
          coalesce((
            select sum(payment.amount)
            from public.payments as payment
            join public.invoices as paid_invoice
              on paid_invoice.id = payment.invoice_id
             and paid_invoice.organization_id = payment.organization_id
            where payment.organization_id = p_organization_id
              and paid_invoice.currency = invoice.currency
              and payment.payment_date >= v_month
              and payment.payment_date <= v_today
          ), 0) as collected_this_month
        from public.invoices as invoice
        where invoice.organization_id = p_organization_id
        group by invoice.currency
      ) as money
    )
  );
end;
$$;

create or replace function public.report_crm(
  p_organization_id uuid,
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_today date;
begin
  v_timezone := public.assert_report_reader(p_organization_id);
  perform public.assert_report_window(p_start, p_end);
  v_today := (now() at time zone v_timezone)::date;

  return jsonb_build_object(
    'pipeline', (
      select coalesce(jsonb_object_agg(lead.status, lead.total), '{}'::jsonb)
      from (
        select status::text as status, count(*) as total
        from public.leads
        where organization_id = p_organization_id
          and (p_start is null or (created_at at time zone v_timezone)::date between p_start and p_end)
        group by status
      ) as lead
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'source', grouped.source,
        'count', grouped.total,
        'won', grouped.won
      ) order by grouped.total desc, grouped.source), '[]'::jsonb)
      from (
        select
          coalesce(nullif(trim(source), ''), 'Unspecified') as source,
          count(*) as total,
          count(*) filter (where status = 'won'::public.lead_status) as won
        from public.leads
        where organization_id = p_organization_id
          and (p_start is null or (created_at at time zone v_timezone)::date between p_start and p_end)
        group by 1
        order by count(*) desc
        limit 30
      ) as grouped
    ),
    'lost_reasons', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reason', grouped.reason,
        'count', grouped.total
      ) order by grouped.total desc, grouped.reason), '[]'::jsonb)
      from (
        select trim(lost_reason) as reason, count(*) as total
        from public.leads
        where organization_id = p_organization_id
          and status = 'lost'::public.lead_status
          and (p_start is null or (created_at at time zone v_timezone)::date between p_start and p_end)
        group by 1
        order by count(*) desc
        limit 20
      ) as grouped
    ),
    'followups', jsonb_build_object(
      'due_today', (
        select count(*) from public.leads as lead
        where lead.organization_id = p_organization_id
          and lead.status not in ('won'::public.lead_status, 'lost'::public.lead_status)
          and lead.next_follow_up_at is not null
          and (lead.next_follow_up_at at time zone v_timezone)::date = v_today
      ),
      'overdue', (
        select count(*) from public.leads as lead
        where lead.organization_id = p_organization_id
          and lead.status not in ('won'::public.lead_status, 'lost'::public.lead_status)
          and lead.next_follow_up_at is not null
          and (lead.next_follow_up_at at time zone v_timezone)::date < v_today
      ),
      'upcoming', (
        select count(*) from public.leads as lead
        where lead.organization_id = p_organization_id
          and lead.status not in ('won'::public.lead_status, 'lost'::public.lead_status)
          and lead.next_follow_up_at is not null
          and (lead.next_follow_up_at at time zone v_timezone)::date > v_today
          and (lead.next_follow_up_at at time zone v_timezone)::date <= (v_today + 7)
      )
    )
  );
end;
$$;

create or replace function public.report_projects(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_today date;
begin
  v_timezone := public.assert_report_reader(p_organization_id);
  v_today := (now() at time zone v_timezone)::date;

  return jsonb_build_object(
    'by_status', (
      select coalesce(jsonb_object_agg(project.status, project.total), '{}'::jsonb)
      from (
        select status::text as status, count(*) as total
        from public.projects
        where organization_id = p_organization_id
        group by status
      ) as project
    ),
    'overdue', (
      select count(*) from public.projects as project
      where project.organization_id = p_organization_id
        and project.deadline < v_today
        and project.status not in ('completed'::public.project_status, 'cancelled'::public.project_status)
    ),
    'due_soon', (
      select count(*) from public.projects as project
      where project.organization_id = p_organization_id
        and project.deadline between v_today and (v_today + 7)
        and project.status not in ('completed'::public.project_status, 'cancelled'::public.project_status)
    ),
    'without_milestones', (
      select count(*) from public.projects as project
      where project.organization_id = p_organization_id
        and not exists (
          select 1 from public.milestones as milestone
          where milestone.organization_id = project.organization_id
            and milestone.project_id = project.id
        )
    ),
    'milestones_completed', (
      select count(*) from public.milestones as milestone
      join public.projects as project
        on project.id = milestone.project_id
       and project.organization_id = milestone.organization_id
      where milestone.organization_id = p_organization_id
        and milestone.status = 'completed'::public.milestone_status
        and exists (
          select 1 from public.milestones as peer
          where peer.organization_id = project.organization_id
            and peer.project_id = project.id
        )
    ),
    'milestones_total', (
      select count(*) from public.milestones as milestone
      where milestone.organization_id = p_organization_id
    ),
    'measurable_projects', (
      select count(distinct milestone.project_id)
      from public.milestones as milestone
      where milestone.organization_id = p_organization_id
    ),
    'tasks', jsonb_build_object(
      'todo', (select count(*) from public.tasks where organization_id = p_organization_id and status = 'todo'::public.task_status),
      'in_progress', (select count(*) from public.tasks where organization_id = p_organization_id and status = 'in_progress'::public.task_status),
      'done', (select count(*) from public.tasks where organization_id = p_organization_id and status = 'done'::public.task_status),
      'overdue', (
        select count(*) from public.tasks as task
        where task.organization_id = p_organization_id
          and task.due_date < v_today
          and task.status <> 'done'::public.task_status
      ),
      'overdue_on_open_projects', (
        select count(*) from public.tasks as task
        join public.projects as project
          on project.id = task.project_id
         and project.organization_id = task.organization_id
        where task.organization_id = p_organization_id
          and task.due_date < v_today
          and task.status <> 'done'::public.task_status
          and project.status not in ('completed'::public.project_status, 'cancelled'::public.project_status)
      )
    ),
    'workload', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'label', person.label,
        'open_tasks', person.open_tasks
      ) order by person.open_tasks desc, person.label), '[]'::jsonb)
      from (
        select
          coalesce(nullif(trim(profile.full_name), ''), profile.email, 'Unassigned') as label,
          count(*) as open_tasks
        from public.tasks as task
        left join public.profiles as profile on profile.id = task.assigned_to
        where task.organization_id = p_organization_id
          and task.status <> 'done'::public.task_status
        group by task.assigned_to, profile.full_name, profile.email
        order by count(*) desc
        limit 15
      ) as person
    )
  );
end;
$$;

create or replace function public.report_sales(
  p_organization_id uuid,
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_today date;
  v_grain text;
begin
  v_timezone := public.assert_report_reader(p_organization_id);
  perform public.assert_report_window(p_start, p_end);
  v_today := (now() at time zone v_timezone)::date;
  v_grain := case
    when p_start is null then 'month'
    when (p_end - p_start) <= 31 then 'day'
    when (p_end - p_start) <= 120 then 'week'
    else 'month'
  end;

  return jsonb_build_object(
    'grain', v_grain,
    'proposal_counts', (
      select coalesce(jsonb_object_agg(proposal.status, proposal.total), '{}'::jsonb)
      from (
        select status::text as status, count(*) as total
        from public.proposals
        where organization_id = p_organization_id
          and (p_start is null or issue_date between p_start and p_end)
        group by status
      ) as proposal
    ),
    'proposal_money', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'currency', money.currency,
        'open', public.report_money(money.open_amount),
        'accepted', public.report_money(money.accepted_amount),
        'rejected', public.report_money(money.rejected_amount)
      ) order by money.currency), '[]'::jsonb)
      from (
        select
          currency,
          coalesce(sum(total) filter (where status = 'sent'::public.proposal_status), 0) as open_amount,
          coalesce(sum(total) filter (where status = 'accepted'::public.proposal_status), 0) as accepted_amount,
          coalesce(sum(total) filter (where status = 'rejected'::public.proposal_status), 0) as rejected_amount
        from public.proposals
        where organization_id = p_organization_id
          and (p_start is null or issue_date between p_start and p_end)
        group by currency
      ) as money
    ),
    'billing', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'currency', money.currency,
        'invoiced', public.report_money(money.invoiced),
        'collected', public.report_money(money.collected),
        'outstanding_now', public.report_money(money.outstanding_now),
        'overdue_now', public.report_money(money.overdue_now)
      ) order by money.currency), '[]'::jsonb)
      from (
        select
          invoice.currency,
          coalesce(sum(invoice.total) filter (
            where invoice.status in (
              'issued'::public.invoice_status,
              'partially_paid'::public.invoice_status,
              'paid'::public.invoice_status
            )
            and (
              p_start is null
              or coalesce((invoice.issued_at at time zone v_timezone)::date, invoice.issue_date) between p_start and p_end
            )
          ), 0) as invoiced,
          coalesce((
            select sum(payment.amount)
            from public.payments as payment
            join public.invoices as paid_invoice
              on paid_invoice.id = payment.invoice_id
             and paid_invoice.organization_id = payment.organization_id
            where payment.organization_id = p_organization_id
              and paid_invoice.currency = invoice.currency
              and (p_start is null or payment.payment_date between p_start and p_end)
          ), 0) as collected,
          coalesce(sum(invoice.balance_due) filter (
            where invoice.status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status)
              and invoice.balance_due > 0
          ), 0) as outstanding_now,
          coalesce(sum(invoice.balance_due) filter (
            where invoice.status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status)
              and invoice.balance_due > 0
              and invoice.due_date < v_today
          ), 0) as overdue_now
        from public.invoices as invoice
        where invoice.organization_id = p_organization_id
        group by invoice.currency
      ) as money
    ),
    'invoice_counts', jsonb_build_object(
      'issued_in_period', (
        select count(*) from public.invoices as invoice
        where invoice.organization_id = p_organization_id
          and invoice.status in (
            'issued'::public.invoice_status,
            'partially_paid'::public.invoice_status,
            'paid'::public.invoice_status
          )
          and (p_start is null or coalesce((invoice.issued_at at time zone v_timezone)::date, invoice.issue_date) between p_start and p_end)
      ),
      'paid_now', (
        select count(*) from public.invoices
        where organization_id = p_organization_id and status = 'paid'::public.invoice_status
      ),
      'partial_now', (
        select count(*) from public.invoices
        where organization_id = p_organization_id and status = 'partially_paid'::public.invoice_status
      ),
      'outstanding_now', (
        select count(*) from public.invoices
        where organization_id = p_organization_id
          and status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status)
          and balance_due > 0
      )
    ),
    'payment_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'currency', trend.currency,
        'bucket', trend.bucket,
        'amount', public.report_money(trend.amount)
      ) order by trend.currency, trend.bucket), '[]'::jsonb)
      from (
        select
          invoice.currency,
          case v_grain
            when 'day' then payment.payment_date
            when 'week' then date_trunc('week', payment.payment_date::timestamp)::date
            else date_trunc('month', payment.payment_date::timestamp)::date
          end as bucket,
          sum(payment.amount) as amount
        from public.payments as payment
        join public.invoices as invoice
          on invoice.id = payment.invoice_id
         and invoice.organization_id = payment.organization_id
        where payment.organization_id = p_organization_id
          and (p_start is null or payment.payment_date between p_start and p_end)
        group by 1, 2
      ) as trend
    ),
    'invoice_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'currency', trend.currency,
        'bucket', trend.bucket,
        'amount', public.report_money(trend.amount)
      ) order by trend.currency, trend.bucket), '[]'::jsonb)
      from (
        select
          invoice.currency,
          case v_grain
            when 'day' then coalesce((invoice.issued_at at time zone v_timezone)::date, invoice.issue_date)
            when 'week' then date_trunc('week', coalesce((invoice.issued_at at time zone v_timezone)::date, invoice.issue_date)::timestamp)::date
            else date_trunc('month', coalesce((invoice.issued_at at time zone v_timezone)::date, invoice.issue_date)::timestamp)::date
          end as bucket,
          sum(invoice.total) as amount
        from public.invoices as invoice
        where invoice.organization_id = p_organization_id
          and invoice.status in (
            'issued'::public.invoice_status,
            'partially_paid'::public.invoice_status,
            'paid'::public.invoice_status
          )
          and (
            p_start is null
            or coalesce((invoice.issued_at at time zone v_timezone)::date, invoice.issue_date) between p_start and p_end
          )
        group by 1, 2
      ) as trend
    )
  );
end;
$$;

create or replace function public.report_clients(
  p_organization_id uuid,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
begin
  v_timezone := public.assert_report_reader(p_organization_id);
  if p_limit is null or p_limit < 1 or p_limit > 25 or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'You do not have access.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.clients where organization_id = p_organization_id),
    'rows', (
      select coalesce(jsonb_agg(row_data.payload order by row_data.name), '[]'::jsonb)
      from (
        select
          client.name,
          jsonb_build_object(
            'id', client.id,
            'name', client.name,
            'projects', (
              select count(*) from public.projects as project
              where project.organization_id = client.organization_id and project.client_id = client.id
            ),
            'active_projects', (
              select count(*) from public.projects as project
              where project.organization_id = client.organization_id
                and project.client_id = client.id
                and project.status = 'active'::public.project_status
            ),
            'money', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'currency', grouped.currency,
                'accepted_proposals', public.report_money(grouped.accepted_proposals),
                'invoiced', public.report_money(grouped.invoiced),
                'collected', public.report_money(grouped.collected),
                'outstanding', public.report_money(grouped.outstanding)
              ) order by grouped.currency), '[]'::jsonb)
              from (
                select
                  parts.currency,
                  coalesce(sum(parts.accepted_proposals), 0) as accepted_proposals,
                  coalesce(sum(parts.invoiced), 0) as invoiced,
                  coalesce(sum(parts.collected), 0) as collected,
                  coalesce(sum(parts.outstanding), 0) as outstanding
                from (
                  select
                    proposal.currency,
                    sum(proposal.total) filter (where proposal.status = 'accepted'::public.proposal_status) as accepted_proposals,
                    0::numeric as invoiced,
                    0::numeric as collected,
                    0::numeric as outstanding
                  from public.proposals as proposal
                  where proposal.organization_id = client.organization_id
                    and proposal.client_id = client.id
                  group by proposal.currency
                  union all
                  select
                    invoice.currency,
                    0::numeric,
                    sum(invoice.total) filter (
                      where invoice.status in (
                        'issued'::public.invoice_status,
                        'partially_paid'::public.invoice_status,
                        'paid'::public.invoice_status
                      )
                    ),
                    sum(invoice.amount_paid) filter (
                      where invoice.status in (
                        'issued'::public.invoice_status,
                        'partially_paid'::public.invoice_status,
                        'paid'::public.invoice_status
                      )
                    ),
                    sum(invoice.balance_due) filter (
                      where invoice.status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status)
                        and invoice.balance_due > 0
                    )
                  from public.invoices as invoice
                  where invoice.organization_id = client.organization_id
                    and invoice.client_id = client.id
                  group by invoice.currency
                ) as parts
                group by parts.currency
              ) as grouped
            )
          ) as payload
        from public.clients as client
        where client.organization_id = p_organization_id
        order by client.name
        limit p_limit offset p_offset
      ) as row_data
    )
  );
end;
$$;

create or replace function public.report_client(
  p_organization_id uuid,
  p_client_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
begin
  v_timezone := public.assert_report_reader(p_organization_id);
  if p_client_id is null or not exists (
    select 1 from public.clients as client
    where client.id = p_client_id and client.organization_id = p_organization_id
  ) then
    raise exception 'You do not have access.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'active_projects', (
        select count(*) from public.projects as project
        where project.organization_id = p_organization_id
          and project.client_id = p_client_id
          and project.status = 'active'::public.project_status
      ),
      'money', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'currency', combined.currency,
          'accepted_proposals', public.report_money(sum(combined.accepted_proposals)),
          'invoiced', public.report_money(sum(combined.invoiced)),
          'collected', public.report_money(sum(combined.collected)),
          'outstanding', public.report_money(sum(combined.outstanding))
        ) order by combined.currency), '[]'::jsonb)
        from (
          select
            proposal.currency,
            sum(proposal.total) filter (where proposal.status = 'accepted'::public.proposal_status) as accepted_proposals,
            0::numeric as invoiced,
            0::numeric as collected,
            0::numeric as outstanding
          from public.proposals as proposal
          where proposal.organization_id = p_organization_id and proposal.client_id = p_client_id
          group by proposal.currency
          union all
          select
            invoice.currency,
            0::numeric,
            sum(invoice.total) filter (
              where invoice.status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status, 'paid'::public.invoice_status)
            ),
            sum(invoice.amount_paid) filter (
              where invoice.status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status, 'paid'::public.invoice_status)
            ),
            sum(invoice.balance_due) filter (
              where invoice.status in ('issued'::public.invoice_status, 'partially_paid'::public.invoice_status)
                and invoice.balance_due > 0
            )
          from public.invoices as invoice
          where invoice.organization_id = p_organization_id and invoice.client_id = p_client_id
          group by invoice.currency
        ) as combined
        group by combined.currency
      )
    )
  );
end;
$$;

create index leads_org_created_idx on public.leads (organization_id, created_at);
create index proposals_org_issue_idx on public.proposals (organization_id, issue_date);
create index invoices_org_issued_idx on public.invoices (organization_id, issued_at);
create index payments_org_date_idx on public.payments (organization_id, payment_date);
create index projects_org_deadline_idx on public.projects (organization_id, deadline);

revoke all on function public.organization_report_timezone(uuid) from public, anon, authenticated;
revoke all on function public.report_money(numeric) from public, anon, authenticated;
revoke all on function public.assert_report_reader(uuid) from public, anon, authenticated;
revoke all on function public.assert_report_window(date, date) from public, anon, authenticated;
revoke all on function public.report_overview(uuid, date, date) from public, anon;
revoke all on function public.report_crm(uuid, date, date) from public, anon;
revoke all on function public.report_projects(uuid) from public, anon;
revoke all on function public.report_sales(uuid, date, date) from public, anon;
revoke all on function public.report_clients(uuid, integer, integer) from public, anon;
revoke all on function public.report_client(uuid, uuid) from public, anon;

grant execute on function public.report_overview(uuid, date, date) to authenticated;
grant execute on function public.report_crm(uuid, date, date) to authenticated;
grant execute on function public.report_projects(uuid) to authenticated;
grant execute on function public.report_sales(uuid, date, date) to authenticated;
grant execute on function public.report_clients(uuid, integer, integer) to authenticated;
grant execute on function public.report_client(uuid, uuid) to authenticated;
