DROP INDEX IF EXISTS "emails_message_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "emails_user_id_message_id_key" ON "emails"("user_id", "message_id");
