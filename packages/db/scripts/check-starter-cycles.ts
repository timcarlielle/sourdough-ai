/**
 * Sanity check: assert at most one ACTIVE starter cycle per user.
 * Run with: npx tsx scripts/check-starter-cycles.ts (from packages/db or repo root with DATABASE_URL set)
 */
import { PrismaClient } from "@prisma/client";
import { assertSingleActiveCyclePerUser } from "../starter-cycle-service";

const prisma = new PrismaClient();

async function main() {
  await assertSingleActiveCyclePerUser(prisma);
  console.log("OK: at most one ACTIVE cycle per user.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
