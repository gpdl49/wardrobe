-- CreateEnum
CREATE TYPE "photo_background_status" AS ENUM ('queued', 'ready', 'skipped', 'failed');

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "background_status" "photo_background_status";
