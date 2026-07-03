import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bakeId = (await params).id;
  const bake = await prisma.bake.findFirst({
    where: { id: bakeId, userId: userId },
  });
  if (!bake) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sets = await prisma.recipeAdjustmentSet.findMany({
    where: { bakeId },
    orderBy: { createdAt: "desc" },
    select: { id: true, suggestions: true, suggestionFeedback: true, confidenceScore: true, createdAt: true },
  });
  return NextResponse.json(sets);
}
