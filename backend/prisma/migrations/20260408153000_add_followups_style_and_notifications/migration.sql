-- AlterTable
ALTER TABLE "users"
ADD COLUMN "style" JSONB,
ADD COLUMN "important_contacts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "emails"
ADD COLUMN "is_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "follow_up" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "follow_up_at" TIMESTAMP(3);
