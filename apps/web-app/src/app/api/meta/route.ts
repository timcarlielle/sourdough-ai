import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/meta — unauthenticated server capabilities. The mobile app uses this to
 * validate a server URL during onboarding, check version compatibility, and learn
 * which optional features (AI) this instance has enabled. Also used as a healthcheck.
 */
export async function GET() {
  return NextResponse.json({
    name: "sourdough-ai",
    version: process.env.APP_VERSION ?? "1.0.0",
    // Oldest mobile app version this server supports (semver)
    minMobileVersion: "1.0.0",
    features: {
      // AI features (voice transcription/parsing, bake analysis, dashboard insights,
      // recipe scraping) require OPENAI_API_KEY on the worker + web app.
      ai: Boolean(process.env.OPENAI_API_KEY),
    },
  });
}
