ALTER TABLE "emails"
  ADD COLUMN IF NOT EXISTS "is_sent_by_user" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_edited_reply" BOOLEAN NOT NULL DEFAULT false;

UPDATE "emails"
SET "is_sent_by_user" = true
WHERE "is_sent" = true
  AND "is_sent_by_user" = false;
