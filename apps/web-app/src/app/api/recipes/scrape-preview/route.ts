import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl || !rawUrl.startsWith("http")) {
    return NextResponse.json({ error: "Valid URL required" }, { status: 400 });
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "SourdoughApp/1.0 (recipe preview)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ title: null, description: null });
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ").slice(0, 200) : null;
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const description = metaDesc ? metaDesc[1].trim().replace(/\s+/g, " ").slice(0, 500) : null;
    return NextResponse.json({ title: title ?? url.hostname.replace(/^www\./, ""), description });
  } catch {
    return NextResponse.json({ title: url.hostname.replace(/^www\./, ""), description: null });
  }
}
