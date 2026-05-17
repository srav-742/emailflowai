CREATE TABLE IF NOT EXISTS "email_embeddings" (
    "id" TEXT NOT NULL,
    "email_id" TEXT NOT NULL,
    "subject_vector" JSONB NOT NULL,
    "body_vector" JSONB NOT NULL,
    "thread_vector" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_embeddings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_embeddings_email_id_key" ON "email_embeddings"("email_id");

ALTER TABLE "email_embeddings"
ADD CONSTRAINT "email_embeddings_email_id_fkey"
FOREIGN KEY ("email_id") REFERENCES "emails"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "memory_nodes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memory_nodes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "memory_nodes_user_id_type_idx" ON "memory_nodes"("user_id", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "memory_nodes_user_type_value_idx" ON "memory_nodes"("user_id", "type", "value");

CREATE TABLE IF NOT EXISTS "memory_relations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "relation_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memory_relations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "memory_relations_user_id_relation_type_idx" ON "memory_relations"("user_id", "relation_type");

CREATE TABLE IF NOT EXISTS "agent_workflow_approvals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_workflow_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_workflow_approvals_user_id_status_idx" ON "agent_workflow_approvals"("user_id", "status");
