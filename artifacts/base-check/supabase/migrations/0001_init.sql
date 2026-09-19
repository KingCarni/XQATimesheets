-- xQA Timesheets — initial schema (TS-010)
-- Runs on an empty Supabase Postgres database (relies on the `auth` schema).
-- UUID PKs, timestamptz for auditability, is_active over hard deletes.

-- ---------------------------------------------------------------------------
-- Extensions & helpers
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- Keep updated_at fresh on any row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type app_role as enum ('employee', 'manager', 'admin');
create type assignment_role as enum ('member', 'lead', 'manager');
create type timesheet_status as enum ('open', 'submitted', 'approved', 'rejected', 'locked');
create type approval_action as enum ('submit', 'approve', 'reject', 'reopen', 'lock');
create type pto_status as enum ('requested', 'approved', 'rejected', 'cancelled');
create type audit_entity_type as enum (
  'user',
  'employee_profile',
  'project',
  'project_assignment',
  'platform',
  'activity_type',
  'time_entry',
  'timesheet_period',
  'approval',
  'pto_request'
);

-- ---------------------------------------------------------------------------
-- Users & employees
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role app_role not null default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table employee_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  employee_code text,
  full_name text not null,
  manager_user_id uuid references users(id),
  default_daily_hours numeric(4, 2) not null default 8.00,
  department text,
  timezone text not null default 'America/Vancouver',
  start_date date,
  end_date date,
  can_approve boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_employee_profiles_manager on employee_profiles (manager_user_id);

-- ---------------------------------------------------------------------------
-- Catalogs: projects, platforms, activity types
-- ---------------------------------------------------------------------------

create table projects (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  client_name text,
  is_active boolean not null default true,
  requires_platform boolean not null default false,
  color_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  is_billable boolean not null default false,
  is_pto boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Assignments & entry templates
-- ---------------------------------------------------------------------------

create table project_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references employee_profiles(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  assignment_role assignment_role not null default 'member',
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_profile_id, project_id)
);

create index idx_assignments_project on project_assignments (project_id);

create table entry_templates (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references employee_profiles(id) on delete cascade,
  project_id uuid references projects(id),
  platform_id uuid references platforms(id),
  activity_type_id uuid not null references activity_types(id),
  description text,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_templates_employee on entry_templates (employee_profile_id);

-- ---------------------------------------------------------------------------
-- Timesheet periods & time entries
-- ---------------------------------------------------------------------------

create table timesheet_periods (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references employee_profiles(id) on delete cascade,
  week_start_date date not null,
  week_end_date date not null,
  expected_hours numeric(5, 2) not null,
  total_hours numeric(5, 2) not null default 0,
  status timesheet_status not null default 'open',
  submitted_at timestamptz,
  submitted_by uuid references users(id),
  locked_at timestamptz,
  locked_by uuid references users(id),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_profile_id, week_start_date)
);

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references employee_profiles(id) on delete cascade,
  timesheet_period_id uuid not null references timesheet_periods(id) on delete cascade,
  entry_date date not null,
  project_id uuid references projects(id),
  platform_id uuid references platforms(id),
  activity_type_id uuid not null references activity_types(id),
  hours numeric(4, 2) not null check (hours > 0 and hours <= 24),
  description text not null default '',
  source text not null default 'manual',
  created_by uuid not null references users(id),
  updated_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_time_entries_employee_date on time_entries (employee_profile_id, entry_date);
create index idx_time_entries_project_date on time_entries (project_id, entry_date);
create index idx_time_entries_period on time_entries (timesheet_period_id);

-- ---------------------------------------------------------------------------
-- Approvals & audit history
-- ---------------------------------------------------------------------------

create table approvals (
  id uuid primary key default gen_random_uuid(),
  timesheet_period_id uuid not null references timesheet_periods(id) on delete cascade,
  actor_user_id uuid not null references users(id),
  action approval_action not null,
  comment text,
  created_at timestamptz not null default now()
);

create index idx_approvals_period on approvals (timesheet_period_id, created_at desc);

create table audit_history (
  id uuid primary key default gen_random_uuid(),
  entity_type audit_entity_type not null,
  entity_id uuid not null,
  action text not null,
  actor_user_id uuid references users(id),
  occurred_at timestamptz not null default now(),
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index idx_audit_entity on audit_history (entity_type, entity_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- PTO
-- ---------------------------------------------------------------------------

create table pto_requests (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references employee_profiles(id) on delete cascade,
  activity_type_id uuid not null references activity_types(id),
  start_date date not null,
  end_date date not null,
  hours_per_day numeric(4, 2) not null default 8.00,
  total_hours numeric(5, 2) not null,
  status pto_status not null default 'requested',
  notes text,
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pto_requests_employee on pto_requests (employee_profile_id, start_date);

create table pto_balances (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references employee_profiles(id) on delete cascade,
  pto_type text not null,
  balance_hours numeric(6, 2) not null default 0,
  effective_date date not null,
  created_at timestamptz not null default now(),
  unique (employee_profile_id, pto_type, effective_date)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger trg_users_updated before update on users
  for each row execute function public.set_updated_at();
create trigger trg_employee_profiles_updated before update on employee_profiles
  for each row execute function public.set_updated_at();
create trigger trg_projects_updated before update on projects
  for each row execute function public.set_updated_at();
create trigger trg_platforms_updated before update on platforms
  for each row execute function public.set_updated_at();
create trigger trg_activity_types_updated before update on activity_types
  for each row execute function public.set_updated_at();
create trigger trg_project_assignments_updated before update on project_assignments
  for each row execute function public.set_updated_at();
create trigger trg_entry_templates_updated before update on entry_templates
  for each row execute function public.set_updated_at();
create trigger trg_timesheet_periods_updated before update on timesheet_periods
  for each row execute function public.set_updated_at();
create trigger trg_time_entries_updated before update on time_entries
  for each row execute function public.set_updated_at();
create trigger trg_pto_requests_updated before update on pto_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Maintain timesheet_periods.total_hours from its time_entries
-- ---------------------------------------------------------------------------

create or replace function public.recalc_period_total(p_period_id uuid)
returns void
language plpgsql
as $$
begin
  update timesheet_periods tp
  set total_hours = coalesce(
    (select sum(te.hours) from time_entries te where te.timesheet_period_id = p_period_id),
    0
  )
  where tp.id = p_period_id;
end;
$$;

create or replace function public.time_entries_maintain_total()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recalc_period_total(old.timesheet_period_id);
    return old;
  end if;

  perform public.recalc_period_total(new.timesheet_period_id);
  -- If an entry was moved between periods, refresh the source period too.
  if (tg_op = 'UPDATE' and new.timesheet_period_id <> old.timesheet_period_id) then
    perform public.recalc_period_total(old.timesheet_period_id);
  end if;
  return new;
end;
$$;

create trigger trg_time_entries_total
  after insert or update or delete on time_entries
  for each row execute function public.time_entries_maintain_total();

-- ---------------------------------------------------------------------------
-- Provision a public.users row when an auth user is created.
-- Role/name can be adjusted by an admin afterwards.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role)
  values (
    new.id,
    new.email,
    coalesce((new.raw_app_meta_data ->> 'role')::app_role, 'employee')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Mirror public.users.role into auth JWT app_metadata so middleware and RLS
-- can read the role without an extra query. Source of truth stays users.role.
-- ---------------------------------------------------------------------------

create or replace function public.sync_role_to_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE' and new.role is not distinct from old.role) then
    return new;
  end if;
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role::text)
  where id = new.id;
  return new;
end;
$$;

create trigger trg_users_sync_role
  after insert or update of role on users
  for each row execute function public.sync_role_to_auth();
