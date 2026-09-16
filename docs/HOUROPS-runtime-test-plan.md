# HourOps — Migration Runtime-Test Plan (non-production)

> **Do NOT run the multi-tenant migration against production.** The configured
> Neon endpoint in `.env.local` (`ep-odd-flower-avo0i76f`, db `neondb`) is the
> current live single-tenant database. Everything below runs against a **Neon
> branch** or a throwaway database.

## 0. Pre-flight duplicate check (run against a *read* connection to prod, or the branch)

The only migration step that can fail on existing data is the **new**
`projects (organization_id, name)` unique index. Verify there are no duplicate
project names first:

```sql
SELECT name, count(*) FROM projects GROUP BY name HAVING count(*) > 1;
SELECT code, count(*) FROM projects WHERE code IS NOT NULL GROUP BY code HAVING count(*) > 1;   -- should already be empty (was globally unique)
```

If the first query returns rows, rename the duplicates (or drop the
`projects_organization_id_name_key` index from the migration) **before** applying.

## 1. Create a Neon branch (isolated copy of prod data)

- Neon Console → project → **Branches → New branch** from `main` (or `production`).
  This copies schema **and data** at the current point in time.
- Copy the branch's pooled and unpooled connection strings.

CLI alternative:
```bash
neonctl branches create --name hourops-migration-test
neonctl connection-string hourops-migration-test           # pooled
neonctl connection-string hourops-migration-test --pooled false   # unpooled
```

## 2. Point a local env at the branch

Create `.env.test.local` (do not overwrite `.env.local`):
```
DATABASE_URL="<branch pooled url>"
DATABASE_URL_UNPOOLED="<branch unpooled url>"
AUTH_SECRET="<any dev secret>"
NEXT_PUBLIC_ROOT_DOMAIN="localhost"
# Leave AUTH_COOKIE_DOMAIN unset locally.
```
`prisma.config.ts` loads `.env.local`; for the test run either temporarily point
it at the branch or export the branch URLs in the shell before each command:
```bash
export DATABASE_URL="<branch pooled>"
export DATABASE_URL_UNPOOLED="<branch unpooled>"
```

## 3. Apply Stage 1 to the branch

```bash
npx prisma migrate deploy      # applies 20260916120000_hourops_multitenant to the branch
```
Watch for failure on `projects_organization_id_name_key` (see step 0).

## 4. Backfill verification (no separate backfill needed — it's in the migration)

The migration itself backfills XQA. Confirm nothing was left unowned:
```sql
-- Every owned table must have ZERO NULLs after the migration.
SELECT 'employee_profiles' t, count(*) FROM employee_profiles WHERE organization_id IS NULL
UNION ALL SELECT 'projects', count(*) FROM projects WHERE organization_id IS NULL
UNION ALL SELECT 'platforms', count(*) FROM platforms WHERE organization_id IS NULL
UNION ALL SELECT 'activity_types', count(*) FROM activity_types WHERE organization_id IS NULL
UNION ALL SELECT 'project_assignments', count(*) FROM project_assignments WHERE organization_id IS NULL
UNION ALL SELECT 'entry_templates', count(*) FROM entry_templates WHERE organization_id IS NULL
UNION ALL SELECT 'timesheet_periods', count(*) FROM timesheet_periods WHERE organization_id IS NULL
UNION ALL SELECT 'time_entries', count(*) FROM time_entries WHERE organization_id IS NULL
UNION ALL SELECT 'approvals', count(*) FROM approvals WHERE organization_id IS NULL
UNION ALL SELECT 'pto_requests', count(*) FROM pto_requests WHERE organization_id IS NULL
UNION ALL SELECT 'pto_balances', count(*) FROM pto_balances WHERE organization_id IS NULL
UNION ALL SELECT 'employee_contracts', count(*) FROM employee_contracts WHERE organization_id IS NULL
UNION ALL SELECT 'contract_attachments', count(*) FROM contract_attachments WHERE organization_id IS NULL
UNION ALL SELECT 'equipment_assignments', count(*) FROM equipment_assignments WHERE organization_id IS NULL
UNION ALL SELECT 'hardware_requests', count(*) FROM hardware_requests WHERE organization_id IS NULL
UNION ALL SELECT 'leave_entitlements', count(*) FROM leave_entitlements WHERE organization_id IS NULL
UNION ALL SELECT 'audit_history', count(*) FROM audit_history WHERE organization_id IS NULL;

-- Members created for every user.
SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM organization_members) AS members;
```
(`audit_history` may legitimately keep NULLs only if some rows predate a user; all
current rows should backfill. Investigate any non-zero owned-table count.)

## 5. Regenerate Prisma & drift check

```bash
npx prisma generate
# Drift check against the branch (uses the branch as its own shadow is not needed):
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script
# Expect: no differences (the applied DB matches the schema).
```

## 6. Run the app against the branch

```bash
npm run build && npm run start      # or npm run dev
```
Log in as an existing XQA user (host `localhost:3000`). Confirm the existing data
loads (see smoke checklist §XQA).

## 7. Seed the demo tenant

```bash
node prisma/seed-demo.mjs
```
Then visit the platform landing (`http://localhost:3000`) → **Explore the live
demo** (or log in directly as `demo@acme-qa.example.com` / `hourops-demo` on
`http://acme.localhost:3000`).

## 8. Verify the migrated XQA tenant

Run the smoke checklist §XQA on `http://xqa.localhost:3000` (or `localhost:3000`,
which resolves the sole membership).

## 9. Create a second disposable tenant

- `http://localhost:3000/signup` → create "Tenant B" (slug `tenb`).
- Complete onboarding, add a project, invite a user (copy the invite link),
  accept it in a private window.

## 10. Deliberately test cross-tenant isolation

Run the smoke checklist §Isolation. Capture two facts to compare: a Tenant A
`employee_profile.id` / `project.id` / `timesheet_period.id`, and attempt to reach
them while logged into Tenant B (URL/id manipulation, export params, API routes).
Every attempt must 404 / redirect / return empty — never Tenant A data.

## Local subdomain notes

- `<slug>.localhost` resolves to `127.0.0.1` on modern browsers automatically.
- Cross-subdomain **sessions do not share on localhost** (no shared cookie
  domain). Log in on each tenant's own host. This is expected; production uses
  `AUTH_COOKIE_DOMAIN=.hourops.ca` for cross-subdomain sessions.

## Teardown

Delete the Neon branch when finished (`neonctl branches delete hourops-migration-test`).
Nothing touched production.
