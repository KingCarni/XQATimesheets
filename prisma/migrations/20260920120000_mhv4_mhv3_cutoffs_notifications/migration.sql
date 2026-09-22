-- MHV-4 + MHV-3
-- Additive migration: organization-level submission cutoff config + in-app
-- notifications framework. No data mutation. Safe forward-only.

ALTER TABLE "organizations"
  ADD COLUMN "submission_cutoff_enabled"     boolean NOT NULL DEFAULT false,
  ADD COLUMN "submission_cutoff_offset_days" smallint,
  ADD COLUMN "submission_cutoff_time"        text;

-- Validate cutoff shape when enabled: offset 0..14, HH:MM 24h.
ALTER TABLE "organizations"
  ADD CONSTRAINT "chk_org_cutoff_offset_range"
    CHECK ("submission_cutoff_offset_days" IS NULL
           OR ("submission_cutoff_offset_days" >= 0
               AND "submission_cutoff_offset_days" <= 14));

ALTER TABLE "organizations"
  ADD CONSTRAINT "chk_org_cutoff_time_format"
    CHECK ("submission_cutoff_time" IS NULL
           OR "submission_cutoff_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "organizations"
  ADD CONSTRAINT "chk_org_cutoff_complete_when_enabled"
    CHECK ("submission_cutoff_enabled" = false
           OR ("submission_cutoff_offset_days" IS NOT NULL
               AND "submission_cutoff_time"        IS NOT NULL));

-- Reusable in-app notifications table. Delivery channels (email, push, …) will
-- consume the same rows later; this pass writes to it directly.
CREATE TABLE "notifications" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id"         uuid NOT NULL REFERENCES "users"("id")         ON DELETE CASCADE,
  "type"            text NOT NULL,
  "title"           text NOT NULL,
  "message"         text NOT NULL,
  "href"            text,
  "metadata"        jsonb,
  "dedupe_key"      text,
  "read_at"         timestamptz(6),
  "created_at"      timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX "idx_notifications_user_unread"
  ON "notifications"("user_id", "read_at", "created_at" DESC);

CREATE INDEX "idx_notifications_org_created"
  ON "notifications"("organization_id", "created_at" DESC);

-- Idempotent inserts: a producer using the same dedupe_key twice within one
-- (org,user) never creates two rows. Notifications without a dedupe key
-- (one-off transitions) can freely coexist.
CREATE UNIQUE INDEX "uq_notifications_dedupe"
  ON "notifications"("organization_id", "user_id", "dedupe_key")
  WHERE "dedupe_key" IS NOT NULL;
