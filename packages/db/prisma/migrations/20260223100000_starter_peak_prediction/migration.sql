-- Starter Peak Prediction: enums, StarterCycle columns, StarterCycleAnalysis, StarterModel, StarterPrediction

-- CreateEnum
CREATE TYPE "StarterCycleStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'INVALID');
CREATE TYPE "StarterCycleSource" AS ENUM ('FEEDING', 'INFERRED');
CREATE TYPE "StarterModelType" AS ENUM ('TEMP_ONLY', 'TEMP_PLUS_HYDRATION');

-- AlterTable starter_cycles: add status, source, updated_at
ALTER TABLE "starter_cycles" ADD COLUMN IF NOT EXISTS "status" "StarterCycleStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "starter_cycles" ADD COLUMN IF NOT EXISTS "source" "StarterCycleSource" NOT NULL DEFAULT 'FEEDING';
ALTER TABLE "starter_cycles" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: COMPLETED where ended_at is set, FEEDING where source_feeding_id is set
UPDATE "starter_cycles" SET "status" = 'COMPLETED' WHERE "ended_at" IS NOT NULL;
UPDATE "starter_cycles" SET "source" = 'INFERRED' WHERE "source_feeding_id" IS NULL;

-- Index for active cycle lookups
CREATE INDEX "starter_cycles_user_id_status_idx" ON "starter_cycles"("user_id", "status");

-- CreateTable starter_cycle_analyses
CREATE TABLE "starter_cycle_analyses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "is_valid" BOOLEAN NOT NULL,
    "invalid_reason" TEXT,
    "trim_start_minutes" INTEGER NOT NULL,
    "trim_end_minutes" INTEGER NOT NULL,
    "sample_count_raw" INTEGER NOT NULL,
    "sample_count_used" INTEGER NOT NULL,
    "outlier_count" INTEGER NOT NULL,
    "baseline_distance_mm" DOUBLE PRECISION NOT NULL,
    "avg_ambient_temp_c" DOUBLE PRECISION,
    "avg_humidity_pct" DOUBLE PRECISION,
    "fit_quality" DOUBLE PRECISION NOT NULL,
    "amplitude_mm" DOUBLE PRECISION NOT NULL,
    "mu_minutes" DOUBLE PRECISION NOT NULL,
    "sigma_minutes" DOUBLE PRECISION NOT NULL,
    "time_to_peak_minutes" DOUBLE PRECISION NOT NULL,
    "rise_rate" DOUBLE PRECISION,
    "decay_rate" DOUBLE PRECISION,
    "auc" DOUBLE PRECISION,
    "debug_series" JSONB NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "starter_cycle_analyses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "starter_cycle_analyses_cycle_id_key" ON "starter_cycle_analyses"("cycle_id");
CREATE INDEX "starter_cycle_analyses_user_id_idx" ON "starter_cycle_analyses"("user_id");
CREATE INDEX "starter_cycle_analyses_cycle_id_idx" ON "starter_cycle_analyses"("cycle_id");

ALTER TABLE "starter_cycle_analyses" ADD CONSTRAINT "starter_cycle_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "starter_cycle_analyses" ADD CONSTRAINT "starter_cycle_analyses_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "starter_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable starter_models
CREATE TABLE "starter_models" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "model_type" "StarterModelType" NOT NULL DEFAULT 'TEMP_ONLY',
    "param_a" DOUBLE PRECISION,
    "param_k" DOUBLE PRECISION,
    "param_b" DOUBLE PRECISION,
    "sigma_base_minutes" DOUBLE PRECISION,
    "hydration_coeff" DOUBLE PRECISION,
    "trained_on_cycles" INTEGER NOT NULL DEFAULT 0,
    "last_trained_at" TIMESTAMP(3),
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "starter_models_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "starter_models_user_id_idx" ON "starter_models"("user_id");
CREATE UNIQUE INDEX "starter_models_user_id_is_active_key" ON "starter_models"("user_id") WHERE "is_active" = true;

ALTER TABLE "starter_models" ADD CONSTRAINT "starter_models_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable starter_predictions
CREATE TABLE "starter_predictions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "predicted_at" TIMESTAMP(3) NOT NULL,
    "predicted_peak_at" TIMESTAMP(3) NOT NULL,
    "predicted_peak_start_at" TIMESTAMP(3) NOT NULL,
    "predicted_peak_end_at" TIMESTAMP(3) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "predicted_series" JSONB,
    "error_minutes" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "starter_predictions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "starter_predictions_cycle_id_model_id_key" ON "starter_predictions"("cycle_id", "model_id");
CREATE INDEX "starter_predictions_user_id_idx" ON "starter_predictions"("user_id");
CREATE INDEX "starter_predictions_cycle_id_idx" ON "starter_predictions"("cycle_id");
CREATE INDEX "starter_predictions_model_id_idx" ON "starter_predictions"("model_id");

ALTER TABLE "starter_predictions" ADD CONSTRAINT "starter_predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "starter_predictions" ADD CONSTRAINT "starter_predictions_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "starter_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "starter_predictions" ADD CONSTRAINT "starter_predictions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "starter_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
