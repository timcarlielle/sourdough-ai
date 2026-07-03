import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const ingredientSchema = z.object({ name: z.string(), amountG: z.number().nullable(), bakerPct: z.number().nullable(), notes: z.string().nullable(), sortOrder: z.number() });
const stepSchema = z.object({ section: z.string(), stepText: z.string(), sortOrder: z.number() });
const noteSchema = z.object({ category: z.string(), noteText: z.string(), sortOrder: z.number() });

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  ingredients: z.array(ingredientSchema).optional(),
  steps: z.array(stepSchema).optional(),
  recipeNotes: z.array(noteSchema).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const recipe = await prisma.recipe.findFirst({
    where: { id, userId: userId },
    include: {
      ingredients: { orderBy: { sortOrder: "asc" } },
      steps: { orderBy: { sortOrder: "asc" } },
      recipeNotes: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(recipe);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const existing = await prisma.recipe.findFirst({
    where: { id, userId: userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await req.json();
    const data = updateSchema.parse(body);
    if (data.ingredients !== undefined) {
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: id } });
      if (data.ingredients.length) {
        await prisma.recipeIngredient.createMany({
          data: data.ingredients.map((i) => ({ recipeId: id, ...i })),
        });
      }
    }
    if (data.steps !== undefined) {
      await prisma.recipeStep.deleteMany({ where: { recipeId: id } });
      if (data.steps.length) {
        await prisma.recipeStep.createMany({
          data: data.steps.map((s) => ({ recipeId: id, ...s })),
        });
      }
    }
    if (data.recipeNotes !== undefined) {
      await prisma.recipeNote.deleteMany({ where: { recipeId: id } });
      if (data.recipeNotes.length) {
        await prisma.recipeNote.createMany({
          data: data.recipeNotes.map((n) => ({ recipeId: id, ...n })),
        });
      }
    }
    const recipe = await prisma.recipe.update({
      where: { id },
      data: {
        ...(data.title != null && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
      },
      include: { ingredients: true, steps: true, recipeNotes: true },
    });
    return NextResponse.json(recipe);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const existing = await prisma.recipe.findFirst({
    where: { id, userId: userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.isDefault) {
    return NextResponse.json({ error: "Cannot delete default recipe" }, { status: 400 });
  }
  await prisma.recipe.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
