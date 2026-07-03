-- CreateEnum
CREATE TYPE "BakeEventPhase" AS ENUM ('mixing', 'bulk_fermentation', 'dividing', 'shaping', 'proofing', 'baking', 'cooling', 'evaluation', 'environment', 'custom');

-- CreateTable
CREATE TABLE "bake_events" (
    "id" TEXT NOT NULL,
    "bake_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "event_phase" "BakeEventPhase" NOT NULL,
    "sequence_index" INTEGER,
    "metadata" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bake_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bake_events_bake_id_occurred_at_idx" ON "bake_events"("bake_id", "occurred_at" ASC);

-- CreateIndex
CREATE INDEX "bake_events_user_id_idx" ON "bake_events"("user_id");

-- AddForeignKey
ALTER TABLE "bake_events" ADD CONSTRAINT "bake_events_bake_id_fkey" FOREIGN KEY ("bake_id") REFERENCES "bakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bake_events" ADD CONSTRAINT "bake_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
