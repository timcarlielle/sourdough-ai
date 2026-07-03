import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

function getConnection() {
  const u = new URL(redisUrl);
  return {
    host: u.hostname,
    port: Number(u.port) || 6379,
    password: u.password || undefined,
  };
}

let recipeScrapeQueue: Queue | null = null;

export function getRecipeScrapeQueue(): Queue {
  if (!recipeScrapeQueue) {
    recipeScrapeQueue = new Queue("recipe_scrape", {
      connection: getConnection(),
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 3000 } },
    });
  }
  return recipeScrapeQueue;
}

export type RecipeScrapeJobPayload = {
  recipeId: string;
  url: string;
};
