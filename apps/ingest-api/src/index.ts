import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import { PrismaClient, ReadingType, VoiceLogStatus, type Prisma } from "@prisma/client";
import { Queue } from "bullmq";
import { tokenHash, validateStarterBody, validateDoughBody, validateVoiceBody } from "./validate";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

const PORT = Number(process.env.INGEST_API_PORT) || 3001;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function getRedisConnection() {
  const u = new URL(REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port) || 6379,
    password: u.password || undefined,
  };
}

let voiceParseQueue: Queue<{ voiceLogId: string }> | null = null;
function getVoiceParseQueue(): Queue<{ voiceLogId: string }> {
  if (!voiceParseQueue) {
    voiceParseQueue = new Queue("voice_parse_and_apply", {
      connection: getRedisConnection(),
      defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 2000 } },
    });
  }
  return voiceParseQueue;
}

/** Resolve device from Authorization: Bearer <token>. Returns device id + userId or null. */
async function resolveDeviceFromToken(authHeader: string | undefined): Promise<{ deviceId: string; userId: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) return null;
  const hash = tokenHash(rawToken);
  const device = await prisma.device.findFirst({
    where: { tokenHash: hash, isActive: true },
    select: { id: true, userId: true },
  });
  return device ? { deviceId: device.id, userId: device.userId } : null;
}

/** Resolve user from VoiceToken (Bearer). Returns userId or null. */
async function resolveUserFromVoiceToken(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) return null;
  const hash = tokenHash(rawToken);
  const voiceToken = await prisma.voiceToken.findFirst({
    where: { tokenHash: hash, revokedAt: null },
    select: { userId: true, id: true },
  });
  if (!voiceToken) return null;
  await prisma.voiceToken.update({
    where: { id: voiceToken.id },
    data: { lastUsedAt: new Date() },
  });
  return voiceToken.userId;
}

/** Resolve user from Bearer: try device token first, then voice token. */
async function resolveUserFromBearer(authHeader: string | undefined): Promise<{ userId: string; deviceId?: string } | null> {
  const device = await resolveDeviceFromToken(authHeader);
  if (device) return { userId: device.userId, deviceId: device.deviceId };
  const userId = await resolveUserFromVoiceToken(authHeader);
  return userId ? { userId } : null;
}

async function requireDeviceAuth(
  req: FastifyRequest & { device?: { deviceId: string; userId: string } },
  reply: FastifyReply
): Promise<void> {
  try {
    const device = await resolveDeviceFromToken(req.headers.authorization);
    if (!device) {
      reply.status(401).send({ error: "Invalid or missing device token" });
      return;
    }
    req.device = device;
  } catch (err) {
    req.log.error(err);
    reply.status(500).send({ error: "Invalid or missing device token" });
  }
}

async function requireVoiceOrDeviceAuth(
  req: FastifyRequest & { auth?: { userId: string; deviceId?: string } },
  reply: FastifyReply
): Promise<void> {
  try {
    const auth = await resolveUserFromBearer(req.headers.authorization);
    if (!auth) {
      reply.status(401).send({ error: "Invalid or missing token" });
      return;
    }
    req.auth = auth;
  } catch (err) {
    req.log.error(err);
    reply.status(500).send({ error: "Invalid or missing token" });
  }
}

app.post("/ingest/starter", { preHandler: requireDeviceAuth }, async (req, reply) => {
  const device = (req as FastifyRequest & { device: { deviceId: string; userId: string } }).device!;

  const body = req.body as Record<string, unknown>;
  const parsed = validateStarterBody(body);
  if (!parsed.ok) {
    return reply.status(400).send({ error: parsed.error });
  }
  const { recordedAt, distanceMm, ambientTempC, ambientHumidityPct } = parsed.data;

  try {
    await prisma.$transaction([
      prisma.telemetryReading.create({
        data: {
          userId: device.userId,
          deviceId: device.deviceId,
          readingType: ReadingType.starter,
          recordedAt,
          payload: body.meta != null ? ({ meta: body.meta } as Prisma.InputJsonObject) : undefined,
          distanceMm: distanceMm ?? undefined,
          ambientTempC: ambientTempC ?? undefined,
          ambientHumidityPct: ambientHumidityPct ?? undefined,
        },
      }),
      prisma.device.update({
        where: { id: device.deviceId },
        data: { lastSeenAt: new Date() },
      }),
    ]);
  } catch (e) {
    req.log.error(e);
    return reply.status(500).send({ error: "Failed to store reading" });
  }
  return reply.status(204).send();
});

app.post("/ingest/dough", { preHandler: requireDeviceAuth }, async (req, reply) => {
  const device = (req as FastifyRequest & { device: { deviceId: string; userId: string } }).device!;

  const body = req.body as Record<string, unknown>;
  const parsed = validateDoughBody(body);
  if (!parsed.ok) {
    return reply.status(400).send({ error: parsed.error });
  }
  const { recordedAt, distanceMm, doughTempC, ambientTempC, ambientHumidityPct } = parsed.data;

  try {
    await prisma.$transaction([
      prisma.telemetryReading.create({
        data: {
          userId: device.userId,
          deviceId: device.deviceId,
          readingType: ReadingType.dough,
          recordedAt,
          payload: body as Prisma.InputJsonObject,
          distanceMm: distanceMm ?? undefined,
          doughTempC: doughTempC ?? undefined,
          ambientTempC: ambientTempC ?? undefined,
          ambientHumidityPct: ambientHumidityPct ?? undefined,
        },
      }),
      prisma.device.update({
        where: { id: device.deviceId },
        data: { lastSeenAt: new Date() },
      }),
    ]);
  } catch (e) {
    req.log.error(e);
    return reply.status(500).send({ error: "Failed to store reading" });
  }
  return reply.status(204).send();
});

const VOICE_QUERY_POLL_MS = 5000;
const VOICE_QUERY_POLL_INTERVAL_MS = 250;

app.post("/ingest/voice", { preHandler: requireVoiceOrDeviceAuth }, async (req, reply) => {
  const auth = (req as FastifyRequest & { auth: { userId: string } }).auth!;
  const body = req.body as Record<string, unknown>;
  const parsed = validateVoiceBody(body);
  if (!parsed.ok) {
    return reply.status(400).send({ error: parsed.error });
  }
  const { recordedAt, text, source, rawMeta } = parsed.data;
  const receivedAt = new Date();

  let voiceLogId: string;
  try {
    const voiceLog = await prisma.voiceLog.create({
      data: {
        userId: auth.userId,
        source,
        recordedAt,
        receivedAt,
        text,
        rawMeta: rawMeta ?? undefined,
        status: VoiceLogStatus.pending,
      },
    });
    voiceLogId = voiceLog.id;
    const queue = getVoiceParseQueue();
    await queue.add("parse", { voiceLogId }, { jobId: `voice-${voiceLogId}` });
  } catch (e) {
    req.log.error(e);
    return reply.status(500).send({ error: "Failed to store voice log" });
  }

  const deadline = Date.now() + VOICE_QUERY_POLL_MS;
  while (Date.now() < deadline) {
    const log = await prisma.voiceLog.findUnique({
      where: { id: voiceLogId },
      select: { responseText: true, status: true },
    });
    if (log?.responseText != null && log.responseText.length > 0) {
      return reply.status(200).send({ response_text: log.responseText });
    }
    if (log?.status === "applied" && log.responseText == null) {
      return reply.status(204).send();
    }
    if (log?.status === "error") {
      return reply.status(200).send({ response_text: "Something went wrong. Check the app." });
    }
    await new Promise((r) => setTimeout(r, VOICE_QUERY_POLL_INTERVAL_MS));
  }

  return reply.status(200).send({ response_text: "One moment please." });
});

app.get("/health", async (_req, reply) => {
  return reply.send({ ok: true });
});

app.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`[ingest-api] Server started, listening on 0.0.0.0:${PORT}`);
});
