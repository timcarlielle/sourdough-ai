/**
 * Server-side feature flags. AI features (voice logging, dashboard insights,
 * recipe scraping) require OPENAI_API_KEY on the web app AND the worker.
 * Clients read the same flag from GET /api/meta.
 */
export function aiFeaturesEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
