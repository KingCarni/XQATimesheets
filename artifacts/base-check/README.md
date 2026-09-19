# xQA Timesheets

Internal web app for capturing daily time, reviewing team completion, approving
weekly submissions, and exporting reporting data. Built with **Next.js 16 (App
Router)**, **TypeScript**, **Tailwind CSS**, **Neon Postgres**, **Prisma**, and
**Auth.js**.

Preserves the existing spreadsheet mental model: _Date, Project, Employee,
Platform, Hours, Work Type, Description_.

## Status

Auth, role-based route protection, the app shell/nav, the Prisma-backed schema,
catalog seed, and the My Timesheet workflow are in place. Team, Approvals,
Reports, and Admin are routed and role-gated placeholders awaiting their tickets.

## Prerequisites

- Node.js 20+
- A Neon Postgres database

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment:

   ```bash
   cp .env.example .env.local
   ```

   Fill in `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `AUTH_SECRET`.

3. Apply the database schema and seed catalogs:

   ```bash
   npx prisma migrate deploy
   npx prisma db seed
   ```

4. Provision users in `users` and `employee_profiles`. Passwords are stored in
   `users.password_hash` using the same scrypt format Auth.js verifies at login:

   ```bash
   npm run provision:user -- --email "tester@example.com" --name "Smoke Tester" --role employee
   ```

   The script reads `.env.local`, uses `DATABASE_URL_UNPOOLED`, and prompts for
   the password without writing plaintext credentials to the repository or seed
   files. Use `--role manager|admin`, `--employee-code`, `--department`, or
   `--manager-email` only when needed.

5. Run the app:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and sign in at `/login`.

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
  api/auth/             Auth.js route handlers
lib/
  auth/                 Session, password, and authorization helpers
  permissions/          Route to role map, nav
  timesheets/           My Timesheet queries/actions support
prisma/
  schema.prisma         Neon schema
  migrations/           Prisma migrations
  seed.mjs              Baseline catalog seed
types/                  Domain enums + serializable DB DTO types
proxy.ts                Auth.js route protection
```

## Roles

`employee` can manage their own editable timesheets. `manager` unlocks manager
routes, but project-scoped data access requires a `project_assignments` row with
`assignment_role` of `lead` or `manager` on a shared active project. `admin`
retains global access.
