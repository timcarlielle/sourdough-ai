-- CreateEnum
CREATE TYPE "FeedingSource" AS ENUM ('manual', 'siri');
CREATE TYPE "BakeEventSource" AS ENUM ('manual', 'siri', 'sensor', 'recipe', 'engine');
CREATE TYPE "VoiceLogStatus" AS ENUM ('pending', 'applied', 'error');
CREATE TYPE "NoteSource" AS ENUM ('manual', 'siri');

-- AlterTable starter_feedings: add source
ALTER TABLE "starter_feedings" ADD COLUMN "source" "FeedingSource" NOT NULL DEFAULT 'manual';

-- AlterTable bake_events: bake_id nullable, add source
ALTER TABLE "bake_events" ADD COLUMN "source" "BakeEventSource" NOT NULL DEFAULT 'manual';
ALTER TABLE "bake_events" ALTER COLUMN "bake_id" DROP NOT NULL;

-- CreateTable voice_logs
CREATE TABLE "voice_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'siri',
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL,
    "text" TEXT NOT NULL,
    "raw_meta" JSONB,
    "status" "VoiceLogStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "llm_model" TEXT,
    "llm_prompt_version" TEXT,
    "llm_request" JSONB,
    "llm_response" JSONB,
    "applied_actions" JSONB,
    "bake_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "voice_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable voice_log_actions
CREATE TABLE "voice_log_actions" (
    "id" TEXT NOT NULL,
    "voice_log_id" TEXT NOT NULL,
    "action_index" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_log_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable voice_tokens
CREATE TABLE "voice_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "last_used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable notes
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bake_id" TEXT,
    "text" TEXT NOT NULL,
    "source" "NoteSource" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voice_logs_user_id_created_at_idx" ON "voice_logs"("user_id", "created_at" DESC);
CREATE INDEX "voice_logs_bake_id_idx" ON "voice_logs"("bake_id");
CREATE UNIQUE INDEX "voice_log_actions_voice_log_id_action_index_key" ON "voice_log_actions"("voice_log_id", "action_index");
CREATE INDEX "voice_log_actions_voice_log_id_idx" ON "voice_log_actions"("voice_log_id");
CREATE INDEX "voice_tokens_user_id_idx" ON "voice_tokens"("user_id");
CREATE INDEX "voice_tokens_token_hash_idx" ON "voice_tokens"("token_hash");
CREATE INDEX "notes_user_id_idx" ON "notes"("user_id");
CREATE INDEX "notes_bake_id_idx" ON "notes"("bake_id");

-- AddForeignKey
ALTER TABLE "voice_logs" ADD CONSTRAINT "voice_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_logs" ADD CONSTRAINT "voice_logs_bake_id_fkey" FOREIGN KEY ("bake_id") REFERENCES "bakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "voice_log_actions" ADD CONSTRAINT "voice_log_actions_voice_log_id_fkey" FOREIGN KEY ("voice_log_id") REFERENCES "voice_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_tokens" ADD CONSTRAINT "voice_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_bake_id_fkey" FOREIGN KEY ("bake_id") REFERENCES "bakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
