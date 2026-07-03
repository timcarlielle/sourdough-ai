-- AlterTable
ALTER TABLE "voice_logs" ADD COLUMN "response_text" TEXT,
ADD COLUMN "intent_type" TEXT,
ADD COLUMN "processed_at" TIMESTAMP(3);
