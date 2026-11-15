-- CreateEnum
CREATE TYPE "suggestion_status" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "suggestion_feedback" AS ENUM ('saved', 'dismissed');

-- AlterEnum
ALTER TYPE "photo_kind" ADD VALUE 'outfit';

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "outfit_id" UUID;

-- CreateTable
CREATE TABLE "outfits" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "notes" TEXT,
    "seasons" "season"[] DEFAULT ARRAY[]::"season"[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outfits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outfit_items" (
    "outfit_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outfit_items_pkey" PRIMARY KEY ("outfit_id","item_id")
);

-- CreateTable
CREATE TABLE "outfit_tags" (
    "outfit_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "outfit_tags_pkey" PRIMARY KEY ("outfit_id","tag_id")
);

-- CreateTable
CREATE TABLE "outfit_shares" (
    "id" UUID NOT NULL,
    "outfit_id" UUID NOT NULL,
    "grantee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outfit_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outfit_immich_assets" (
    "id" UUID NOT NULL,
    "outfit_id" UUID NOT NULL,
    "linked_by_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "file_name" VARCHAR(255),
    "width" INTEGER,
    "height" INTEGER,
    "thumbhash" VARCHAR(100),
    "taken_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outfit_immich_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "immich_connections" (
    "user_id" UUID NOT NULL,
    "api_key" TEXT NOT NULL,
    "immich_user_id" VARCHAR(64) NOT NULL,
    "immich_email" VARCHAR(320),
    "immich_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "immich_connections_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "suggestion_runs" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "status" "suggestion_status" NOT NULL DEFAULT 'queued',
    "request" JSONB NOT NULL,
    "model" VARCHAR(200),
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outfit_suggestions" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "name" VARCHAR(200) NOT NULL,
    "rationale" TEXT,
    "item_ids" UUID[],
    "feedback" "suggestion_feedback",
    "outfit_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outfit_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outfits_owner_id_created_at_id_idx" ON "outfits"("owner_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "outfit_items_item_id_idx" ON "outfit_items"("item_id");

-- CreateIndex
CREATE INDEX "outfit_tags_tag_id_idx" ON "outfit_tags"("tag_id");

-- CreateIndex
CREATE INDEX "outfit_shares_grantee_id_idx" ON "outfit_shares"("grantee_id");

-- CreateIndex
CREATE UNIQUE INDEX "outfit_shares_outfit_id_grantee_id_key" ON "outfit_shares"("outfit_id", "grantee_id");

-- CreateIndex
CREATE INDEX "outfit_immich_assets_linked_by_id_idx" ON "outfit_immich_assets"("linked_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "outfit_immich_assets_outfit_id_asset_id_key" ON "outfit_immich_assets"("outfit_id", "asset_id");

-- CreateIndex
CREATE INDEX "suggestion_runs_owner_id_created_at_idx" ON "suggestion_runs"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outfit_suggestions_outfit_id_key" ON "outfit_suggestions"("outfit_id");

-- CreateIndex
CREATE INDEX "outfit_suggestions_run_id_idx" ON "outfit_suggestions"("run_id");

-- CreateIndex
CREATE INDEX "outfit_suggestions_owner_id_feedback_idx" ON "outfit_suggestions"("owner_id", "feedback");

-- CreateIndex
CREATE INDEX "photos_outfit_id_idx" ON "photos"("outfit_id");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_outfit_id_fkey" FOREIGN KEY ("outfit_id") REFERENCES "outfits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_outfit_id_fkey" FOREIGN KEY ("outfit_id") REFERENCES "outfits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_tags" ADD CONSTRAINT "outfit_tags_outfit_id_fkey" FOREIGN KEY ("outfit_id") REFERENCES "outfits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_tags" ADD CONSTRAINT "outfit_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_shares" ADD CONSTRAINT "outfit_shares_outfit_id_fkey" FOREIGN KEY ("outfit_id") REFERENCES "outfits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_shares" ADD CONSTRAINT "outfit_shares_grantee_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_immich_assets" ADD CONSTRAINT "outfit_immich_assets_outfit_id_fkey" FOREIGN KEY ("outfit_id") REFERENCES "outfits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_immich_assets" ADD CONSTRAINT "outfit_immich_assets_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immich_connections" ADD CONSTRAINT "immich_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_runs" ADD CONSTRAINT "suggestion_runs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_runs" ADD CONSTRAINT "suggestion_runs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_suggestions" ADD CONSTRAINT "outfit_suggestions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "suggestion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_suggestions" ADD CONSTRAINT "outfit_suggestions_outfit_id_fkey" FOREIGN KEY ("outfit_id") REFERENCES "outfits"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A photo belongs to an item or to an outfit, never both. (The kind is not
-- checked here: a new enum value cannot be used in the transaction that adds
-- it. The API enforces kind 'outfit' for outfit photos.)
ALTER TABLE "photos" ADD CONSTRAINT "photos_item_or_outfit_check" CHECK ("item_id" IS NULL OR "outfit_id" IS NULL);
