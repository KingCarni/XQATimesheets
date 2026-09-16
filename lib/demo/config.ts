/**
 * Shared constants for the read-only demo workspace. Imported by both the demo
 * seed script and the "Live demo" entry action so the two never drift. The demo
 * password is intentionally public — the org is a shared, read-only sandbox
 * (writes are blocked server-side by `assertOrganizationWritable`).
 */
export const DEMO_ORG_ID = "22222222-2222-4222-8222-222222222222";
export const DEMO_ORG_NAME = "Acme QA Studio";
export const DEMO_SLUG = "acme";
export const DEMO_ADMIN_EMAIL = "demo@acme-qa.example.com";
export const DEMO_PASSWORD = "hourops-demo";
export const DEMO_PRIMARY_COLOR = "#7c3aed";
export const DEMO_ACCENT_COLOR = "#1e1b4b";
