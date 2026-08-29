-- xQA Timesheets — project-scoped manager access (TS-020a)
--
-- Managers must NOT gain access to every user just by holding the `manager`
-- role. Access to a user's timesheet is granted through an explicit
-- project-level manager/lead relationship: the reviewer holds a
-- project_assignments row with assignment_role in ('manager','lead') on a
-- project the target user is also assigned to. Admins retain global access.
--
-- This migration adds can_review_profile() and rewrites the policies that
-- previously used the role-only is_manager_or_admin() for profile access.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when the caller leads/manages the given project (or is admin).
create or replace function public.manages_project(p_project_id uuid)
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
      from public.project_assignments pa
      where pa.project_id = p_project_id
        and pa.employee_profile_id = public.current_profile_id()
        and pa.assignment_role in ('manager', 'lead')
        and pa.is_active
    );
$$;

-- True when the caller may review the given profile: admin, or the caller
-- manages at least one project the target profile is actively assigned to.
create or replace function public.can_review_profile(p_profile_id uuid)
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
      from public.project_assignments mgr
      join public.project_assignments tgt on tgt.project_id = mgr.project_id
      where mgr.employee_profile_id = public.current_profile_id()
        and mgr.assignment_role in ('manager', 'lead')
        and mgr.is_active
        and tgt.employee_profile_id = p_profile_id
        and tgt.is_active
    );
$$;

-- Viewing a profile: self, the caller's direct org manager link, or reviewer.
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
      select 1 from public.employee_profiles ep
      where ep.id = p_profile_id
        and (ep.user_id = auth.uid() or ep.manager_user_id = auth.uid())
    )
    or public.can_review_profile(p_profile_id);
$$;

-- ---------------------------------------------------------------------------
-- users: managers may see the user rows of people they can review
-- ---------------------------------------------------------------------------

drop policy if exists users_select_self_or_privileged on users;
create policy users_select_self_or_reviewable on users
  for select using (
    id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from employee_profiles ep
      where ep.user_id = users.id and public.can_review_profile(ep.id)
    )
  );

-- ---------------------------------------------------------------------------
-- employee_profiles: replace the role-only OR with project-scoped review
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select on employee_profiles;
create policy profiles_select on employee_profiles
  for select using (public.can_view_profile(id));

-- ---------------------------------------------------------------------------
-- timesheet_periods: reviewers (not all managers) may update for approvals
-- ---------------------------------------------------------------------------

drop policy if exists periods_owner_update on timesheet_periods;
create policy periods_owner_update on timesheet_periods
  for update using (
    employee_profile_id = public.current_profile_id()
    or public.can_review_profile(employee_profile_id)
  )
  with check (
    employee_profile_id = public.current_profile_id()
    or public.can_review_profile(employee_profile_id)
  );

-- ---------------------------------------------------------------------------
-- approvals: only a reviewer of the period's owner may record an action
-- ---------------------------------------------------------------------------

drop policy if exists approvals_privileged_insert on approvals;
create policy approvals_reviewer_insert on approvals
  for insert with check (
    actor_user_id = auth.uid()
    and exists (
      select 1 from timesheet_periods tp
      where tp.id = approvals.timesheet_period_id
        and public.can_review_profile(tp.employee_profile_id)
    )
  );

-- ---------------------------------------------------------------------------
-- pto_requests: reviewers (not all managers) may act on requests
-- ---------------------------------------------------------------------------

drop policy if exists pto_owner_update on pto_requests;
create policy pto_owner_update on pto_requests
  for update using (
    (employee_profile_id = public.current_profile_id() and status = 'requested')
    or public.can_review_profile(employee_profile_id)
  )
  with check (
    employee_profile_id = public.current_profile_id()
    or public.can_review_profile(employee_profile_id)
  );
