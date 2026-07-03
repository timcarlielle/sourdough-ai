-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('starter_monitor', 'dough_monitor');

-- CreateEnum
CREATE TYPE "ReadingType" AS ENUM ('starter', 'dough');

-- CreateEnum
CREATE TYPE "MilestoneType" AS ENUM ('mix', 'autolyse_start', 'salt_added', 'fold', 'shape', 'proof_start', 'fridge', 'bake_in', 'bake_out', 'score', 'steam_on', 'steam_off', 'other');

-- CreateEnum
CREATE TYPE "VoiceClipStatus" AS ENUM ('uploaded', 'transcribed', 'parsed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "device_type" "DeviceType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_readings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "reading_type" "ReadingType" NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "distance_mm" DOUBLE PRECISION,
    "ambient_temp_c" DOUBLE PRECISION,
    "ambient_humidity_pct" DOUBLE PRECISION,
    "dough_temp_c" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "starter_feedings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT,
    "fed_at" TIMESTAMP(3) NOT NULL,
    "starter_amount_g" DOUBLE PRECISION NOT NULL,
    "flour_amount_g" DOUBLE PRECISION NOT NULL,
    "flour_notes" TEXT,
    "water_amount_g" DOUBLE PRECISION NOT NULL,
    "water_temp_c" DOUBLE PRECISION,
    "salt_g" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "starter_feedings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "starter_cycles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "source_feeding_id" TEXT,
    "ended_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "starter_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount_g" DOUBLE PRECISION,
    "baker_pct" DOUBLE PRECISION,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_steps" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "step_text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "recipe_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_notes" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "note_text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "recipe_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bakes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "starter_cycle_id" TEXT,
    "dough_device_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "dough_batch_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bake_milestones" (
    "id" TEXT NOT NULL,
    "bake_id" TEXT NOT NULL,
    "milestone_type" "MilestoneType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "meta" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bake_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bake_outcomes" (
    "id" TEXT NOT NULL,
    "bake_id" TEXT NOT NULL,
    "sourness_rating" INTEGER,
    "crumb_openness_rating" INTEGER,
    "oven_spring_rating" INTEGER,
    "gumminess_rating" INTEGER,
    "overall_rating" INTEGER,
    "freeform_notes" TEXT,
    "photo_urls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bake_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_clips" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "audio_url" TEXT,
    "transcription_text" TEXT,
    "parsed_json" JSONB,
    "status" "VoiceClipStatus" NOT NULL DEFAULT 'uploaded',
    "error_message" TEXT,

    CONSTRAINT "voice_clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_events_created" (
    "id" TEXT NOT NULL,
    "voice_clip_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_events_created_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "device_tokens_device_id_idx" ON "device_tokens"("device_id");

-- CreateIndex
CREATE INDEX "telemetry_readings_device_id_recorded_at_idx" ON "telemetry_readings"("device_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "telemetry_readings_user_id_recorded_at_idx" ON "telemetry_readings"("user_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "starter_feedings_user_id_fed_at_idx" ON "starter_feedings"("user_id", "fed_at" DESC);

-- CreateIndex
CREATE INDEX "starter_cycles_user_id_started_at_idx" ON "starter_cycles"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "recipes_user_id_idx" ON "recipes"("user_id");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipe_id_idx" ON "recipe_ingredients"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_steps_recipe_id_idx" ON "recipe_steps"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_notes_recipe_id_idx" ON "recipe_notes"("recipe_id");

-- CreateIndex
CREATE INDEX "bakes_user_id_started_at_idx" ON "bakes"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "bake_milestones_bake_id_idx" ON "bake_milestones"("bake_id");

-- CreateIndex
CREATE INDEX "bake_outcomes_bake_id_idx" ON "bake_outcomes"("bake_id");

-- CreateIndex
CREATE INDEX "voice_clips_user_id_idx" ON "voice_clips"("user_id");

-- CreateIndex
CREATE INDEX "voice_events_created_voice_clip_id_idx" ON "voice_events_created"("voice_clip_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_readings" ADD CONSTRAINT "telemetry_readings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_readings" ADD CONSTRAINT "telemetry_readings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "starter_feedings" ADD CONSTRAINT "starter_feedings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "starter_feedings" ADD CONSTRAINT "starter_feedings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "starter_cycles" ADD CONSTRAINT "starter_cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "starter_cycles" ADD CONSTRAINT "starter_cycles_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "starter_cycles" ADD CONSTRAINT "starter_cycles_source_feeding_id_fkey" FOREIGN KEY ("source_feeding_id") REFERENCES "starter_feedings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_notes" ADD CONSTRAINT "recipe_notes_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bakes" ADD CONSTRAINT "bakes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bakes" ADD CONSTRAINT "bakes_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bakes" ADD CONSTRAINT "bakes_starter_cycle_id_fkey" FOREIGN KEY ("starter_cycle_id") REFERENCES "starter_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bakes" ADD CONSTRAINT "bakes_dough_device_id_fkey" FOREIGN KEY ("dough_device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bake_milestones" ADD CONSTRAINT "bake_milestones_bake_id_fkey" FOREIGN KEY ("bake_id") REFERENCES "bakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bake_outcomes" ADD CONSTRAINT "bake_outcomes_bake_id_fkey" FOREIGN KEY ("bake_id") REFERENCES "bakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_clips" ADD CONSTRAINT "voice_clips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_events_created" ADD CONSTRAINT "voice_events_created_voice_clip_id_fkey" FOREIGN KEY ("voice_clip_id") REFERENCES "voice_clips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
