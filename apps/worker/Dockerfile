# Build from the repo root: docker build -f apps/worker/Dockerfile .
# Runs TypeScript directly via tsx (the db package is consumed as TS source).
FROM node:20-alpine
WORKDIR /app
# Prisma's engines need OpenSSL on Alpine
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/
COPY apps/web-app/package.json ./apps/web-app/
COPY apps/ingest-api/package.json ./apps/ingest-api/
COPY apps/worker/package.json ./apps/worker/
RUN npm ci

COPY packages/db ./packages/db
COPY apps/worker ./apps/worker
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

ENV NODE_ENV=production
CMD ["npm", "run", "start", "--workspace=worker"]
