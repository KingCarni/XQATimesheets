<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# xQA Timesheets — agent notes

Internal time-tracking app. Next.js 16 (App Router) + Supabase (Postgres, Auth, RLS).

## Layout
- `app/(auth)/` — login (email/password); `app/(app)/` — authenticated shell with role-based nav.
- `lib/supabase/` — `client.ts` (browser), `server.ts` (RSC/actions), `middleware.ts` (session refresh helper used by root `proxy.ts`).
- `lib/auth/session.ts` — `getCurrentUser` / `requireUser` / `requireRole`.
- `lib/permissions/routes.ts` — route→role map + nav; also used by the proxy.
- `types/domain.ts` — enums (source of truth in TS); `types/database.ts` — hand-authored DB types (regenerate with `supabase gen types` once live).
- `supabase/migrations/` — `0001_init.sql` (schema), `0002_rls.sql` (policies); `supabase/seeds/seed.sql` (catalogs).

## Conventions
- Roles: `employee` < `manager` < `admin`. `users.role` is authoritative and is mirrored into JWT `app_metadata` by a DB trigger so the proxy/RLS can read it cheaply.
- A timesheet period is editable unless `approved`/`locked` — enforced in `types/domain.ts` (`isPeriodEditable`) and in RLS (`period_is_editable`). Keep both in sync.
- Preserve the spreadsheet field names (Date, Project, Employee, Platform, Hours, Work Type, Description) in forms and exports.
- Auth: always trust `supabase.auth.getUser()` (revalidated), never `getSession()` alone, for authorization.

## Scripts
`npm run dev | build | lint | typecheck | format`

