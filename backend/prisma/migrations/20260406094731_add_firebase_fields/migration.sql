/*
  Warnings:

  - You are about to drop the column `access_token` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `token_expiry` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "access_token",
DROP COLUMN "refresh_token",
DROP COLUMN "token_expiry",
ADD COLUMN     "firebase_uid" TEXT,
ADD COLUMN     "last_login" TIMESTAMP(3),
ADD COLUMN     "profile_image" TEXT;
