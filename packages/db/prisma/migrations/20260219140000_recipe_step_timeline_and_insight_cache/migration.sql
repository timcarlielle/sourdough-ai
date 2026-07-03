-- AlterTable (recipe_steps: timeline fields for dashboard)
ALTER TABLE "recipe_steps" ADD COLUMN "estimated_minutes_from_start" INTEGER,
ADD COLUMN "event_type" TEXT,
ADD COLUMN "event_phase" TEXT;

-- CreateTable (dashboard insight cache)
CREATE TABLE "dashboard_insight_cache" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "insights" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_insight_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_insight_cache_user_id_key" ON "dashboard_insight_cache"("user_id");

ALTER TABLE "dashboard_insight_cache" ADD CONSTRAINT "dashboard_insight_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
