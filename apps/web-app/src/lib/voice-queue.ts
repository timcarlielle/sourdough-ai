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

let voiceQueue: Queue | null = null;

export function getVoiceQueue(): Queue {
  if (!voiceQueue) {
    voiceQueue = new Queue("voice", {
      connection: getConnection(),
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
    });
  }
  return voiceQueue;
}

export type VoiceJobPayload = {
  voiceClipId: string;
  userId: string;
  bakeId: string | null;
};
