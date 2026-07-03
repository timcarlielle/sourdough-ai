import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultStarterModel } from "db";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "At least 8 characters"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = bodySchema.parse(body);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }
    const passwordHash = await hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });
    // Create default recipe for new user (PRD §11)
    const defaultRecipe = {
      title: "Everyday Sourdough",
      description: "Baker's % recipe. Total flour 420g, ~71.4% hydration.",
      isDefault: true,
    };
    await prisma.recipe.create({
      data: {
        userId: user.id,
        ...defaultRecipe,
        ingredients: {
          create: [
            { name: "Bread flour (total)", amountG: 360, bakerPct: 85.7, sortOrder: 0 },
            { name: "Starter (100% hydration)", amountG: 120, bakerPct: 28.6, notes: "60g flour + 60g water", sortOrder: 1 },
            { name: "Water", amountG: 240, bakerPct: 57.1, sortOrder: 2 },
            { name: "Oil", amountG: 13.5, bakerPct: 3.2, notes: "~1 tbsp", sortOrder: 3 },
            { name: "Salt", amountG: 2, bakerPct: 0.5, notes: "pinch; raise to ~2% to taste", sortOrder: 4 },
          ],
        },
        steps: {
          create: [
            { section: "mix", stepText: "Mix flour, water, and starter; autolyse 30–60 min.", sortOrder: 0 },
            { section: "mix", stepText: "Add salt and oil; mix until combined.", sortOrder: 1 },
            { section: "bulk", stepText: "Bulk ferment with stretches/folds every 30 min for 2–3 h.", sortOrder: 2 },
            { section: "shape", stepText: "Shape and place in banneton.", sortOrder: 3 },
            { section: "bake", stepText: "Proof (room temp or cold). Bake in preheated Dutch oven with lid on, then lid off.", sortOrder: 4 },
          ],
        },
        recipeNotes: {
          create: [
            { category: "timing", noteText: "Total flour 420g (360 + 60 from starter). Hydration ~71.4%.", sortOrder: 0 },
            { category: "flour", noteText: "Prefermented flour 60g (~14.3%).", sortOrder: 1 },
            { category: "troubleshooting", noteText: "Adjust salt to ~2% (e.g. 8.4g) for taste.", sortOrder: 2 },
          ],
        },
      },
    });
    await getOrCreateDefaultStarterModel(prisma, user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
