# Build from the repo root: docker build -f apps/web-app/Dockerfile .
FROM node:20-alpine AS base
WORKDIR /app
# Prisma's engines need OpenSSL on Alpine
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/
COPY apps/web-app/package.json ./apps/web-app/
COPY apps/ingest-api/package.json ./apps/ingest-api/
COPY apps/worker/package.json ./apps/worker/
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=web-app

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next standalone output mirrors the monorepo layout: server.js is under apps/web-app/
COPY --from=builder /app/apps/web-app/.next/standalone ./
COPY --from=builder /app/apps/web-app/.next/static ./apps/web-app/.next/static
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web-app/server.js"]
