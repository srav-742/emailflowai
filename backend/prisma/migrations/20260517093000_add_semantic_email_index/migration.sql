CREATE TABLE "semantic_email_index" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "subject_text" TEXT,
    "search_text" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "embedding_model" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local-hash',
    "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "semantic_email_index_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "semantic_email_index_email_id_key" ON "semantic_email_index"("email_id");
CREATE INDEX "semantic_email_index_user_id_indexed_at_idx" ON "semantic_email_index"("user_id", "indexed_at" DESC);

ALTER TABLE "semantic_email_index"
ADD CONSTRAINT "semantic_email_index_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "semantic_email_index"
ADD CONSTRAINT "semantic_email_index_email_id_fkey"
FOREIGN KEY ("email_id") REFERENCES "emails"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
