import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";

const updateSchema = z.object({
  suggestionFeedback: z.record(z.enum(["accepted", "ignored"])).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const set = await prisma.recipeAdjustmentSet.findFirst({
    where: { id, recipe: { userId: userId } },
    include: { bake: { select: { id: true, startedAt: true } }, recipe: { select: { id: true, title: true } } },
  });
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(set);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const set = await prisma.recipeAdjustmentSet.findFirst({
    where: { id, recipe: { userId: userId } },
  });
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await req.json();
    const parsed = updateSchema.parse(body);
    const updated = await prisma.recipeAdjustmentSet.update({
      where: { id },
      data: {
        suggestionFeedback: parsed.suggestionFeedback ?? undefined,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
