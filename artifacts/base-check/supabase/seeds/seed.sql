-- xQA Timesheets — baseline catalog seed (TS-011)
-- Controlled vocabularies that do not depend on auth users. Idempotent.
-- Demo users/employees are provisioned separately via scripts/seed-demo.md
-- because they require rows in auth.users.

-- Platforms -----------------------------------------------------------------
insert into platforms (name, sort_order) values
  ('Windows', 10),
  ('macOS', 20),
  ('iOS', 30),
  ('Android', 40),
  ('Web', 50),
  ('PlayStation', 60),
  ('Xbox', 70),
  ('Nintendo Switch', 80)
on conflict (name) do nothing;

-- Activity types (Work Type) ------------------------------------------------
insert into activity_types (name, category, is_billable, is_pto, sort_order) values
  ('Functional Testing', 'testing', true, false, 10),
  ('Regression Testing', 'testing', true, false, 20),
  ('Test Plan Creation', 'planning', true, false, 30),
  ('Test Case Writing', 'planning', true, false, 40),
  ('Bug Verification', 'testing', true, false, 50),
  ('Exploratory Testing', 'testing', true, false, 60),
  ('Automation', 'engineering', true, false, 70),
  ('Meeting', 'overhead', false, false, 80),
  ('Documentation', 'overhead', false, false, 90),
  ('Training', 'overhead', false, false, 100)
on conflict (name) do nothing;

-- PTO / non-project activity types ------------------------------------------
insert into activity_types (name, category, is_billable, is_pto, sort_order) values
  ('Vacation', 'pto', false, true, 200),
  ('Sick Leave', 'pto', false, true, 210),
  ('Statutory Holiday', 'pto', false, true, 220),
  ('Unpaid Leave', 'pto', false, true, 230)
on conflict (name) do nothing;

-- Sample projects -----------------------------------------------------------
insert into projects (code, name, client_name, requires_platform, color_token) values
  ('ELEC', 'Electrum', 'Acme Interactive', true, 'blue'),
  ('APOL', 'Apollo', 'Helios Studios', true, 'violet'),
  ('INT', 'Internal', null, false, 'slate')
on conflict (code) do nothing;
