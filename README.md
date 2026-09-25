# OmixDesk

OmixDesk is the operations workspace for Omix Solutions. Staff run leads, clients, projects, proposals, and invoices. Clients use a separate portal for the work that has been shared with them.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4
- Supabase Auth and Postgres with row-level security
- Zod
- Optional transactional email through Resend

The browser uses the signed-in user and the anon key. There is no service-role client in this app.

## What it covers

- Organizations, roles, and invitations
- Clients, projects, milestones, tasks, and private files
- CRM leads, activities, and conversion to a client
- Proposals with database-calculated totals and a print view
- A client portal for mapped clients
- Invoices, manual payments, and currency-separated balances
- In-app notifications and optional email after those events commit
- Reports for owners, admins, and project managers

Members can do their operational work. They do not get organization-wide reports. Clients never see staff reports, internal notes, or another client's records.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project.
3. Set `NEXT_PUBLIC_SITE_URL` to the origin you actually use, such as `http://localhost:3000`. Invitation and email links use this origin, then `VERCEL_URL` if it is unset.
4. Apply the SQL migrations below, in order, only if that phase is not already on the database.
5. `npm install`
6. `npm run dev`

## Environment

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
RESEND_API_KEY=
EMAIL_FROM=
```

`RESEND_API_KEY` and `EMAIL_FROM` are optional. Without them, invitations, proposals, invoices, and payments still save. The screen says email is not configured. Do not put a service-role key in the app.

## Commands

```
npm test
npm run typecheck
npm run lint
npm run build
npm audit
```

## Migrations

Run each file once, in this order, in the Supabase SQL editor. Do not rerun a migration that has already been applied.

1. `supabase/migrations/20260325000000_phase1_foundation.sql`
2. `supabase/migrations/20260925000000_phase2_operations.sql`
3. `supabase/migrations/20260925000001_phase3_crm.sql`
4. `supabase/migrations/20260925000002_phase4_proposals.sql`
5. `supabase/migrations/20260925000003_phase5_client_portal.sql`
6. `supabase/migrations/20260925000004_phase6_billing.sql`
7. `supabase/migrations/20260925000005_phase7_notifications.sql`
8. `supabase/migrations/20260925000006_phase8_analytics.sql`

Phase 9 does not add a migration.

## Security model

Postgres row-level security is the boundary for tenant data. Staff and clients share the `authenticated` role, so client-safe data is returned by explicit functions instead of broad table access. Proposal and invoice totals are calculated in the database. Payments are recorded by managers and cannot exceed the remaining balance. Reports check owner, admin, or project manager before returning a count. Redirect targets stay on relative in-app paths.

## Optional email

Create a Resend account, verify the sending domain, and set `RESEND_API_KEY` plus `EMAIL_FROM`. The from address must not contain line breaks. Email is sent after the database change commits. A failed send does not undo the invitation, proposal, invoice, or payment.

## Deploy later

The app is prepared for Vercel and Supabase. Deployment steps are in the Phase 9 completion notes. Do not point production at `localhost`.
