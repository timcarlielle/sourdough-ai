import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getRecipeScrapeQueue } from "@/lib/recipe-scrape-queue";
import { getSessionUserId } from "@/lib/session";

const ingredientSchema = z.object({ name: z.string(), amountG: z.number().nullable(), bakerPct: z.number().nullable(), notes: z.string().nullable(), sortOrder: z.number() });
const stepSchema = z.object({ section: z.string(), stepText: z.string(), sortOrder: z.number() });
const noteSchema = z.object({ category: z.string(), noteText: z.string(), sortOrder: z.number() });

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  url: z.union([z.string().url(), z.literal("")]).optional().nullable(),
  ingredients: z.array(ingredientSchema).optional(),
  steps: z.array(stepSchema).optional(),
  recipeNotes: z.array(noteSchema).optional(),
});

export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const recipes = await prisma.recipe.findMany({
    where: {
      userId: userId,
      ...(q && { title: { contains: q, mode: "insensitive" } }),
    },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    include: {
      ingredients: { orderBy: { sortOrder: "asc" } },
      steps: { orderBy: { sortOrder: "asc" } },
      recipeNotes: { orderBy: { sortOrder: "asc" } },
    },
  });
  return NextResponse.json(recipes);
}

export async function POST(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);
    const recipeUrl = parsed.url && parsed.url.length > 0 ? parsed.url : undefined;
    const recipe = await prisma.recipe.create({
      data: {
        userId,
        title: parsed.title,
        description: parsed.description ?? undefined,
        url: recipeUrl ?? undefined,
        scrapePending: !!recipeUrl,
        isDefault: false,
        ingredients: parsed.ingredients?.length
          ? { create: parsed.ingredients.map((i) => ({ name: i.name, amountG: i.amountG, bakerPct: i.bakerPct, notes: i.notes, sortOrder: i.sortOrder })) }
          : undefined,
        steps: parsed.steps?.length
          ? { create: parsed.steps.map((s) => ({ section: s.section, stepText: s.stepText, sortOrder: s.sortOrder })) }
          : undefined,
        recipeNotes: parsed.recipeNotes?.length
          ? { create: parsed.recipeNotes.map((n) => ({ category: n.category, noteText: n.noteText, sortOrder: n.sortOrder })) }
          : undefined,
      },
      include: { ingredients: true, steps: true, recipeNotes: true },
    });
    if (recipeUrl) {
      try {
        const queue = getRecipeScrapeQueue();
        await queue.add("scrape", { recipeId: recipe.id, url: recipeUrl });
      } catch (e) {
        console.error("Enqueue recipe_scrape failed:", e);
      }
    }
    return NextResponse.json(recipe);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
