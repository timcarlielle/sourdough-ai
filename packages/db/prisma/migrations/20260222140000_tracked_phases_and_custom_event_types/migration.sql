-- AlterTable
ALTER TABLE "users" ADD COLUMN "tracked_bake_phases" JSONB;

-- CreateTable
CREATE TABLE "custom_bake_event_types" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phase" "BakeEventPhase" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_bake_event_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_bake_event_types_user_id_event_type_key" ON "custom_bake_event_types"("user_id", "event_type");

-- CreateIndex
CREATE INDEX "custom_bake_event_types_user_id_idx" ON "custom_bake_event_types"("user_id");

-- AddForeignKey
ALTER TABLE "custom_bake_event_types" ADD CONSTRAINT "custom_bake_event_types_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
