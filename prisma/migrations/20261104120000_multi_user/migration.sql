-- CreateEnum
CREATE TYPE "share_access" AS ENUM ('view', 'edit');

-- DropIndex
DROP INDEX "locations_code_key";

-- DropIndex
DROP INDEX "tags_name_key";

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "owner_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "owner_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "packing_sessions" ADD COLUMN     "owner_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "owner_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "owner_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "sub" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320),
    "username" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shares" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "grantee_id" UUID NOT NULL,
    "access" "share_access" NOT NULL,
    "location_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_sub_key" ON "users"("sub");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "shares_grantee_id_idx" ON "shares"("grantee_id");

-- CreateIndex
CREATE INDEX "shares_location_id_idx" ON "shares"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "shares_owner_id_grantee_id_location_id_key" ON "shares"("owner_id", "grantee_id", "location_id");

-- CreateIndex
CREATE INDEX "items_owner_id_created_at_id_idx" ON "items"("owner_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_owner_id_code_key" ON "locations"("owner_id", "code");

-- CreateIndex
CREATE INDEX "packing_sessions_owner_id_idx" ON "packing_sessions"("owner_id");

-- CreateIndex
CREATE INDEX "photos_owner_id_idx" ON "photos"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_owner_id_name_key" ON "tags"("owner_id", "name");

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_grantee_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_sessions" ADD CONSTRAINT "packing_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one whole-wardrobe share per owner and grantee: the unique index
-- above treats NULL location_id values as distinct.
CREATE UNIQUE INDEX "shares_owner_id_grantee_id_wardrobe_key" ON "shares"("owner_id", "grantee_id") WHERE "location_id" IS NULL;
