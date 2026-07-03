/**
 * Seed: ensure every user has the default recipe "Everyday Sourdough"
 * and a default StarterModel for peak prediction.
 * Run after migrations. New users get the default recipe on signup (see web-app).
 */
import { PrismaClient } from "@prisma/client";
import { getOrCreateDefaultStarterModel } from "./starter-prediction";

const prisma = new PrismaClient();

const DEFAULT_RECIPE = {
  title: "Everyday Sourdough",
  description: "Baker's % recipe. Total flour 420g, ~71.4% hydration.",
  ingredients: [
    { name: "Bread flour (total)", amountG: 360, bakerPct: 85.7, notes: null, sortOrder: 0 },
    { name: "Starter (100% hydration)", amountG: 120, bakerPct: 28.6, notes: "60g flour + 60g water", sortOrder: 1 },
    { name: "Water", amountG: 240, bakerPct: 57.1, notes: null, sortOrder: 2 },
    { name: "Oil", amountG: 13.5, bakerPct: 3.2, notes: "~1 tbsp", sortOrder: 3 },
    { name: "Salt", amountG: 2, bakerPct: 0.5, notes: "pinch; raise to ~2% to taste", sortOrder: 4 },
  ],
  steps: [
    { section: "mix", stepText: "Mix flour, water, and starter; autolyse 30–60 min.", sortOrder: 0 },
    { section: "mix", stepText: "Add salt and oil; mix until combined.", sortOrder: 1 },
    { section: "bulk", stepText: "Bulk ferment with stretches/folds every 30 min for 2–3 h.", sortOrder: 2 },
    { section: "shape", stepText: "Shape and place in banneton.", sortOrder: 3 },
    { section: "bake", stepText: "Proof (room temp or cold). Bake in preheated Dutch oven with lid on, then lid off.", sortOrder: 4 },
  ],
  notes: [
    { category: "timing", noteText: "Total flour 420g (360 + 60 from starter). Hydration ~71.4%.", sortOrder: 0 },
    { category: "flour", noteText: "Prefermented flour 60g (~14.3%).", sortOrder: 1 },
    { category: "troubleshooting", noteText: "Adjust salt to ~2% (e.g. 8.4g) for taste.", sortOrder: 2 },
  ],
};

async function main() {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const user of users) {
    const existing = await prisma.recipe.findFirst({
      where: { userId: user.id, isDefault: true },
    });
    if (existing) continue;

    await prisma.recipe.create({
      data: {
        userId: user.id,
        title: DEFAULT_RECIPE.title,
        description: DEFAULT_RECIPE.description,
        isDefault: true,
        ingredients: {
          create: DEFAULT_RECIPE.ingredients.map((i) => ({
            name: i.name,
            amountG: i.amountG,
            bakerPct: i.bakerPct,
            notes: i.notes,
            sortOrder: i.sortOrder,
          })),
        },
        steps: {
          create: DEFAULT_RECIPE.steps.map((s) => ({
            section: s.section,
            stepText: s.stepText,
            sortOrder: s.sortOrder,
          })),
        },
        recipeNotes: {
          create: DEFAULT_RECIPE.notes.map((n) => ({
            category: n.category,
            noteText: n.noteText,
            sortOrder: n.sortOrder,
          })),
        },
      },
    });
    console.log("Created default recipe for user", user.id);
  }

  for (const user of users) {
    await getOrCreateDefaultStarterModel(prisma, user.id);
  }
  console.log("Seed done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
