<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# xQA Timesheets - Agent Notes

Internal time-tracking app. Next.js 16 (App Router) + Neon Postgres + Prisma + Auth.js.

## Layout

- `app/(auth)/` - login (email/password); `app/(app)/` - authenticated shell with role-based nav.
- `app/api/auth/[...nextauth]/route.ts` - Auth.js route handlers.
- `auth.ts` - Auth.js credentials provider and session callbacks.
- `lib/prisma.ts` - Prisma Client singleton using `DATABASE_URL`.
- `lib/auth/session.ts` - `getCurrentUser` / `requireUser` / `requireRole`.
- `lib/auth/authorization.ts` - server-side authorization helpers replacing RLS.
- `lib/permissions/routes.ts` - route to role map + nav.
- `types/domain.ts` - enums; `types/database.ts` - serializable DTO types for Client Components.
- `prisma/schema.prisma` - source of truth for database schema.
- `prisma/migrations/` - Neon/Postgres migrations; `prisma/seed.mjs` - baseline catalogs.

## Conventions

- Roles: `employee` < `manager` < `admin`. `users.role` is authoritative.
- `manager` role alone does not grant organization-wide data access. Project-scoped review access requires an active shared project where the reviewer has `assignment_role` of `lead` or `manager`.
- A timesheet period is editable unless `approved`/`locked`; enforce this in server-side authorization and keep `types/domain.ts` in sync.
- Preserve the spreadsheet field names (Date, Project, Employee, Platform, Hours, Work Type, Description) in forms and exports.
- Auth.js credentials login checks `users.email`, `users.password_hash`, and `users.is_active`. Users are provisioned centrally; there is no public signup.
- Use `DATABASE_URL` for app/runtime queries and `DATABASE_URL_UNPOOLED` for migrations/direct database operations.

## Scripts

`npm run dev | build | lint | typecheck | format`
