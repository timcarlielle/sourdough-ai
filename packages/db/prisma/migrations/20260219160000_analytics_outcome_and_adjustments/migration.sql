-- AlterTable: BakeOutcome - extend for analytics (ratings 1-5, quick toggles)
ALTER TABLE "bake_outcomes" ADD COLUMN "crumb_texture_rating" INTEGER;
ALTER TABLE "bake_outcomes" ADD COLUMN "crust_color_rating" INTEGER;
ALTER TABLE "bake_outcomes" ADD COLUMN "crust_thickness_rating" INTEGER;
ALTER TABLE "bake_outcomes" ADD COLUMN "appearance_rating" INTEGER;
ALTER TABLE "bake_outcomes" ADD COLUMN "too_sour" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bake_outcomes" ADD COLUMN "underproofed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bake_outcomes" ADD COLUMN "overproofed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bake_outcomes" ADD COLUMN "dense" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bake_outcomes" ADD COLUMN "gummy" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: RecipeStep - fermentation intent (target_state)
ALTER TABLE "recipe_steps" ADD COLUMN "target_state" TEXT;

-- CreateTable: RecipeAdjustmentSet (analytics engine output)
CREATE TABLE "recipe_adjustment_sets" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "bake_id" TEXT NOT NULL,
    "suggestions" JSONB NOT NULL,
    "confidence_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_adjustment_sets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recipe_adjustment_sets_recipe_id_idx" ON "recipe_adjustment_sets"("recipe_id");
CREATE INDEX "recipe_adjustment_sets_bake_id_idx" ON "recipe_adjustment_sets"("bake_id");

ALTER TABLE "recipe_adjustment_sets" ADD CONSTRAINT "recipe_adjustment_sets_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_adjustment_sets" ADD CONSTRAINT "recipe_adjustment_sets_bake_id_fkey" FOREIGN KEY ("bake_id") REFERENCES "bakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
