# Provisioning demo users (TS-011)

`users` and `employee_profiles` depend on rows in `auth.users`, which are
created through Supabase Auth rather than plain SQL inserts. Provision demo
accounts one of these ways:

## Option A — Dashboard (quickest)

1. Authentication → Users → **Add user** for each demo account, e.g.
   - `alex@company.com` (manager)
   - `sam@company.com` (employee)
   - `priya@company.com` (employee)
   - `admin@company.com` (admin)
2. The `handle_new_auth_user` trigger creates a matching `public.users` row
   (default role `employee`).
3. Promote roles in SQL (this also mirrors the role into the JWT via trigger):

   ```sql
   update public.users set role = 'admin'   where email = 'admin@company.com';
   update public.users set role = 'manager' where email = 'alex@company.com';
   ```

4. Create employee profiles and manager mapping:

   ```sql
   insert into employee_profiles (user_id, full_name, manager_user_id, can_approve)
   select u.id, 'Alex Rivera', null, true from users u where u.email = 'alex@company.com';

   insert into employee_profiles (user_id, full_name, manager_user_id)
   select u.id, 'Sam Chen', (select id from users where email = 'alex@company.com')
   from users u where u.email = 'sam@company.com';
   ```

5. Grant project-level review access. Managers only see users on projects they
   **manage** (an assignment with `assignment_role = 'manager'` or `'lead'`),
   not every project — so assign both Alex (as manager) and Sam (as member) to
   the same project:

   ```sql
   -- Alex manages Electrum; Sam works on it → Alex can review Sam.
   insert into project_assignments (employee_profile_id, project_id, assignment_role)
   select ep.id, p.id, 'manager'
   from employee_profiles ep, projects p
   where ep.full_name = 'Alex Rivera' and p.code = 'ELEC';

   insert into project_assignments (employee_profile_id, project_id, assignment_role)
   select ep.id, p.id, 'member'
   from employee_profiles ep, projects p
   where ep.full_name = 'Sam Chen' and p.code = 'ELEC';
   ```

## Option B — Admin API script

Use the service-role key with `supabase.auth.admin.createUser(...)` from a Node
script (see `scripts/`), then run the same role/profile SQL as above. Never ship
the service-role key to the browser.

## Local reset

```bash
supabase db reset   # re-runs migrations + seeds/seed.sql
```
