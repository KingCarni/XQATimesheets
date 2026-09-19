-- xQA Timesheets — row-level security (TS-012)
-- Employees see/edit only their own mutable data; managers can read their
-- direct reports and act on related approvals; admins have full access.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they bypass RLS and avoid recursion)
-- ---------------------------------------------------------------------------

create or replace function public.current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('manager', 'admin'), false);
$$;

-- The caller's own employee_profile id (null if none).
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employee_profiles where user_id = auth.uid();
$$;

-- True when the caller manages the given profile (its manager_user_id is me),
-- or the caller is an admin.
create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.employee_profiles ep
      where ep.id = p_profile_id
        and (ep.user_id = auth.uid() or ep.manager_user_id = auth.uid())
    );
$$;

-- A period is editable by its owning employee only while open/submitted/rejected.
create or replace function public.period_is_editable(p_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.timesheet_periods tp
    where tp.id = p_period_id and tp.status not in ('approved', 'locked')
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table employee_profiles enable row level security;
alter table projects enable row level security;
alter table platforms enable row level security;
alter table activity_types enable row level security;
alter table project_assignments enable row level security;
alter table entry_templates enable row level security;
alter table timesheet_periods enable row level security;
alter table time_entries enable row level security;
alter table approvals enable row level security;
alter table audit_history enable row level security;
alter table pto_requests enable row level security;
alter table pto_balances enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

create policy users_select_self_or_privileged on users
  for select using (id = auth.uid() or public.is_manager_or_admin());
create policy users_update_admin on users
  for update using (public.is_admin()) with check (public.is_admin());
create policy users_insert_admin on users
  for insert with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- employee_profiles
-- ---------------------------------------------------------------------------

create policy profiles_select on employee_profiles
  for select using (
    user_id = auth.uid() or manager_user_id = auth.uid() or public.is_manager_or_admin()
  );
create policy profiles_update_self on employee_profiles
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy profiles_admin_write on employee_profiles
  for insert with check (public.is_admin());
create policy profiles_admin_delete on employee_profiles
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Catalogs: readable by all authenticated users, writable by admin
-- ---------------------------------------------------------------------------

create policy projects_read on projects
  for select using (auth.role() = 'authenticated');
create policy projects_admin_write on projects
  for all using (public.is_admin()) with check (public.is_admin());

create policy platforms_read on platforms
  for select using (auth.role() = 'authenticated');
create policy platforms_admin_write on platforms
  for all using (public.is_admin()) with check (public.is_admin());

create policy activity_types_read on activity_types
  for select using (auth.role() = 'authenticated');
create policy activity_types_admin_write on activity_types
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- project_assignments — visible to the assignee/their manager/admin; admin write
-- ---------------------------------------------------------------------------

create policy assignments_select on project_assignments
  for select using (public.can_view_profile(employee_profile_id));
create policy assignments_admin_write on project_assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- entry_templates — owner CRUD; managers/admin read
-- ---------------------------------------------------------------------------

create policy templates_select on entry_templates
  for select using (public.can_view_profile(employee_profile_id));
create policy templates_owner_write on entry_templates
  for all using (employee_profile_id = public.current_profile_id())
  with check (employee_profile_id = public.current_profile_id());

-- ---------------------------------------------------------------------------
-- timesheet_periods — owner CRUD; manager/admin read; approvals via actions
-- ---------------------------------------------------------------------------

create policy periods_select on timesheet_periods
  for select using (public.can_view_profile(employee_profile_id));
create policy periods_owner_insert on timesheet_periods
  for insert with check (employee_profile_id = public.current_profile_id());
create policy periods_owner_update on timesheet_periods
  for update using (
    employee_profile_id = public.current_profile_id() or public.is_manager_or_admin()
  )
  with check (
    employee_profile_id = public.current_profile_id() or public.is_manager_or_admin()
  );

-- ---------------------------------------------------------------------------
-- time_entries — owner CRUD while the period is editable; manager/admin read
-- ---------------------------------------------------------------------------

create policy entries_select on time_entries
  for select using (public.can_view_profile(employee_profile_id));
create policy entries_owner_insert on time_entries
  for insert with check (
    employee_profile_id = public.current_profile_id()
    and public.period_is_editable(timesheet_period_id)
  );
create policy entries_owner_update on time_entries
  for update using (
    employee_profile_id = public.current_profile_id()
    and public.period_is_editable(timesheet_period_id)
  )
  with check (
    employee_profile_id = public.current_profile_id()
    and public.period_is_editable(timesheet_period_id)
  );
create policy entries_owner_delete on time_entries
  for delete using (
    employee_profile_id = public.current_profile_id()
    and public.period_is_editable(timesheet_period_id)
  );

-- ---------------------------------------------------------------------------
-- approvals — readable with the period; only managers/admins record actions
-- ---------------------------------------------------------------------------

create policy approvals_select on approvals
  for select using (
    exists (
      select 1 from timesheet_periods tp
      where tp.id = approvals.timesheet_period_id
        and public.can_view_profile(tp.employee_profile_id)
    )
  );
create policy approvals_privileged_insert on approvals
  for insert with check (public.is_manager_or_admin() and actor_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_history — managers/admins read; writes happen via service role/triggers
-- ---------------------------------------------------------------------------

create policy audit_select on audit_history
  for select using (public.is_manager_or_admin());

-- ---------------------------------------------------------------------------
-- pto_requests — owner CRUD (before approval); manager/admin read + approve
-- ---------------------------------------------------------------------------

create policy pto_select on pto_requests
  for select using (public.can_view_profile(employee_profile_id));
create policy pto_owner_insert on pto_requests
  for insert with check (employee_profile_id = public.current_profile_id());
create policy pto_owner_update on pto_requests
  for update using (
    (employee_profile_id = public.current_profile_id() and status = 'requested')
    or public.is_manager_or_admin()
  )
  with check (
    employee_profile_id = public.current_profile_id() or public.is_manager_or_admin()
  );

-- ---------------------------------------------------------------------------
-- pto_balances — owner/admin read; admin write
-- ---------------------------------------------------------------------------

create policy pto_balances_select on pto_balances
  for select using (public.can_view_profile(employee_profile_id));
create policy pto_balances_admin_write on pto_balances
  for all using (public.is_admin()) with check (public.is_admin());
