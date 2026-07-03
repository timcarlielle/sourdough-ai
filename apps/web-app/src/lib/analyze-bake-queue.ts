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

let analyzeBakeQueue: Queue | null = null;

export function getAnalyzeBakeQueue(): Queue {
  if (!analyzeBakeQueue) {
    analyzeBakeQueue = new Queue("analyze_bake", {
      connection: getConnection(),
      defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 3000 } },
    });
  }
  return analyzeBakeQueue;
}

export type AnalyzeBakeJobPayload = { bakeId: string; userId: string };
