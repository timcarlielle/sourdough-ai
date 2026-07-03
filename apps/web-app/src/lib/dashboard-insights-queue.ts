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

let dashboardInsightsQueue: Queue | null = null;

export function getDashboardInsightsQueue(): Queue {
  if (!dashboardInsightsQueue) {
    dashboardInsightsQueue = new Queue("dashboard_insights", {
      connection: getConnection(),
      defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 2000 } },
    });
  }
  return dashboardInsightsQueue;
}

export type DashboardInsightsJobPayload = { userId: string };

let voiceParseQueue: Queue<{ voiceLogId: string }> | null = null;

export function getVoiceParseQueue(): Queue<{ voiceLogId: string }> {
  if (!voiceParseQueue) {
    voiceParseQueue = new Queue("voice_parse_and_apply", {
      connection: getConnection(),
      defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 2000 } },
    });
  }
  return voiceParseQueue;
}
