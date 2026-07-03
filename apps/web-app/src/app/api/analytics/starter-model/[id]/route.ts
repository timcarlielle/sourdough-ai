import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

function requireDebug() {
  if (!process.env.NEXT_PUBLIC_STARTER_DEBUG) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** PATCH /api/analytics/starter-model/[id] — clone, setActive, lock, unlock, overrideParams. Debug only. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = requireDebug();
  if (forbidden) return forbidden;
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const modelId = (await params).id;

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const createNewVersion = body.createNewVersion === true;
  const paramsOverride = body.params as { paramA?: number; paramK?: number; paramB?: number; sigmaBaseMinutes?: number } | undefined;

  const model = await prisma.starterModel.findFirst({
    where: { id: modelId, userId },
  });
  if (!model) return NextResponse.json({ error: "Model not found" }, { status: 404 });

  if (action === "setActive") {
    await prisma.$transaction([
      prisma.starterModel.updateMany({ where: { userId }, data: { isActive: false } }),
      prisma.starterModel.update({ where: { id: modelId }, data: { isActive: true } }),
    ]);
    const updated = await prisma.starterModel.findUnique({ where: { id: modelId } });
    return NextResponse.json(updated);
  }

  if (action === "lock") {
    const updated = await prisma.starterModel.update({
      where: { id: modelId },
      data: { isLocked: true },
    });
    return NextResponse.json(updated);
  }

  if (action === "unlock") {
    const updated = await prisma.starterModel.update({
      where: { id: modelId },
      data: { isLocked: false },
    });
    return NextResponse.json(updated);
  }

  if (action === "clone") {
    const { id: _id, createdAt: _c, updatedAt: _u, meta, ...rest } = model;
    const created = await prisma.starterModel.create({
      data: {
        ...rest,
        userId,
        name: `${model.name} (clone ${new Date().toISOString().slice(0, 10)})`,
        isActive: false,
        isLocked: false,
        meta: meta === null ? Prisma.JsonNull : meta,
      },
    });
    return NextResponse.json(created);
  }

  if (action === "overrideParams" && paramsOverride) {
    const data = {
      paramA: paramsOverride.paramA ?? model.paramA,
      paramK: paramsOverride.paramK ?? model.paramK,
      paramB: paramsOverride.paramB ?? model.paramB,
      sigmaBaseMinutes: paramsOverride.sigmaBaseMinutes ?? model.sigmaBaseMinutes,
    };
    if (createNewVersion) {
      const { id: _id, createdAt: _c, updatedAt: _u, meta, ...rest } = model;
      const created = await prisma.starterModel.create({
        data: {
          ...rest,
          userId,
          name: `${model.name} (override ${new Date().toISOString().slice(0, 10)})`,
          isActive: false,
          isLocked: false,
          ...data,
          meta: meta === null ? Prisma.JsonNull : meta,
        },
      });
      return NextResponse.json(created);
    }
    const updated = await prisma.starterModel.update({
      where: { id: modelId },
      data,
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action or params" }, { status: 400 });
}
