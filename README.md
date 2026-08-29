# xQA Timesheets

Internal web app for capturing daily time, reviewing team completion, approving
weekly submissions, and exporting reporting data. Built with **Next.js 16 (App
Router)**, **TypeScript**, **Tailwind CSS**, and **Supabase** (Postgres + Auth +
Row-Level Security).

Preserves the existing spreadsheet mental model: _Date, Project, Employee,
Platform, Hours, Work Type, Description_.

## Status

Foundation scaffold (backlog tickets TS-001, TS-002, TS-003, TS-010; RLS from
TS-012). Auth, role-based route protection, the app shell/nav, and the full
database schema + policies are in place. Domain screens (My Timesheet, Team,
Approvals, Reports, Admin) are routed and role-gated placeholders awaiting their
tickets.

## Prerequisites

- Node.js 20+ (22+ recommended — `@supabase/supabase-js` warns on 20)
- A Supabase project (cloud) or the [Supabase CLI](https://supabase.com/docs/guides/cli) for local dev

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment:

   ```bash
   cp .env.example .env.local
   ```

   Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` from **Supabase Dashboard → Project Settings → API**.

3. Apply the database schema. Either link the Supabase CLI and push:

   ```bash
   supabase link --project-ref <your-ref>
   supabase db push          # runs supabase/migrations/*.sql
   ```

   …or run local Supabase:

   ```bash
   supabase start
   supabase db reset         # migrations + supabase/seeds/seed.sql
   ```

   For cloud, run `supabase/seeds/seed.sql` via the SQL editor to load catalogs.

4. Provision demo users — see [`supabase/seeds/seed-demo.md`](supabase/seeds/seed-demo.md)
   (users require `auth.users` rows, so they can't be seeded with plain SQL).

5. Run the app:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 — you'll be redirected to `/login`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` | Prettier write |

## Structure

```
app/
  (auth)/login/         Email + password sign-in
  (app)/                Authenticated shell (role-based nav)
    my-timesheet/       Employee entry (TS-020+)
    team/               Manager grid (TS-030)
    approvals/          Approval queue (TS-031)
    reports/            Reporting + export (TS-040/041)
    admin/              Catalogs, users, audit (TS-050+)
  auth/callback/        OAuth / magic-link exchange
lib/
  supabase/             Browser + server + proxy clients
  auth/                 Session & role helpers
  permissions/          Route → role map, nav
types/                  Domain enums + DB types
supabase/
  migrations/           0001_init.sql, 0002_rls.sql
  seeds/                seed.sql, seed-demo.md
proxy.ts                Session refresh + route protection
```

## Roles

`employee` → own timesheet, PTO, history. `manager` → + team view, approvals,
reports. `admin` → + catalogs, user management, audit. `users.role` is the source
of truth and is mirrored into the auth JWT by a trigger for cheap checks in the
proxy and RLS.
