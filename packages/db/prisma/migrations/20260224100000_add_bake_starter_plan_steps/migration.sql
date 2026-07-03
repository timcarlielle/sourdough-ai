-- AlterTable
ALTER TABLE "bakes" ADD COLUMN IF NOT EXISTS "starter_plan_steps" JSONB;
