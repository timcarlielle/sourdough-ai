import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAnalyzeBakeQueue } from "@/lib/analyze-bake-queue";
import { getSessionUserId } from "@/lib/session";

const rating15 = z.number().min(1).max(5).optional().nullable();
const createSchema = z.object({
  outcomeId: z.string().uuid().optional(),
  crumbOpennessRating: rating15,
  crumbTextureRating: rating15,
  crustColorRating: rating15,
  crustThicknessRating: rating15,
  ovenSpringRating: rating15,
  sournessRating: rating15,
  appearanceRating: rating15,
  overallRating: rating15,
  tooSour: z.boolean().optional(),
  underproofed: z.boolean().optional(),
  overproofed: z.boolean().optional(),
  dense: z.boolean().optional(),
  gummy: z.boolean().optional(),
  freeformNotes: z.string().optional().nullable(),
  photoUrls: z.array(z.string()).optional().nullable(),
  gumminessRating: z.number().min(0).max(10).optional().nullable(),
});

export async function POST(
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
  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);
    const { outcomeId: existingId, ...rest } = parsed;

    const data = {
      crumbOpennessRating: rest.crumbOpennessRating ?? undefined,
      crumbTextureRating: rest.crumbTextureRating ?? undefined,
      crustColorRating: rest.crustColorRating ?? undefined,
      crustThicknessRating: rest.crustThicknessRating ?? undefined,
      ovenSpringRating: rest.ovenSpringRating ?? undefined,
      sournessRating: rest.sournessRating ?? undefined,
      appearanceRating: rest.appearanceRating ?? undefined,
      overallRating: rest.overallRating ?? undefined,
      tooSour: rest.tooSour ?? false,
      underproofed: rest.underproofed ?? false,
      overproofed: rest.overproofed ?? false,
      dense: rest.dense ?? false,
      gummy: rest.gummy ?? false,
      freeformNotes: rest.freeformNotes ?? undefined,
      photoUrls: rest.photoUrls ?? undefined,
      gumminessRating: rest.gumminessRating ?? undefined,
    };

    let outcome;
    if (existingId) {
      const existing = await prisma.bakeOutcome.findFirst({
        where: { id: existingId, bakeId },
      });
      if (existing) {
        outcome = await prisma.bakeOutcome.update({
          where: { id: existingId },
          data,
        });
      } else {
        outcome = await prisma.bakeOutcome.create({
          data: { bakeId, ...data },
        });
      }
    } else {
      outcome = await prisma.bakeOutcome.create({
        data: { bakeId, ...data },
      });
    }

    try {
      const queue = getAnalyzeBakeQueue();
      await queue.add("analyze", { bakeId, userId: userId }, { jobId: `analyze-bake-${bakeId}` });
    } catch (e) {
      console.warn("[outcomes] analyze_bake queue add failed:", e);
    }
    return NextResponse.json(outcome);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
