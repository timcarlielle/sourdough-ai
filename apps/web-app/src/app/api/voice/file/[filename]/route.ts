import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSessionUserId } from "@/lib/session";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

/**
 * Serve an uploaded voice clip. Auth: session cookie or Bearer API token; the
 * filename is prefixed with the owner's userId, so callers can only fetch their
 * own clips. The worker normally reads clips from the shared UPLOAD_DIR volume;
 * for split deployments without a shared volume, set INTERNAL_API_SECRET in both
 * services and the worker fetches with an `x-internal-secret` header.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  if (!filename || filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const internalSecret = process.env.INTERNAL_API_SECRET;
  const isInternal = internalSecret != null && req.headers.get("x-internal-secret") === internalSecret;
  if (!isInternal) {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!filename.startsWith(`${userId}-`)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const filepath = path.join(UPLOAD_DIR, filename);
  try {
    const buf = await readFile(filepath);
    return new NextResponse(buf, {
      headers: { "Content-Type": "audio/webm" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
