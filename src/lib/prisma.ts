import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Prisma 7's client requires an explicit driver adapter at runtime (the CLI
// still reads DATABASE_URL directly for migrations, but the generated
// client no longer does). See prisma/schema.prisma + prisma7.config.ts.
function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaBetterSqlite3({ url: url.replace(/^file:/, "") });
  return new PrismaClient({ adapter });
}

// Reuse a single client across hot reloads in dev so we don't open a new
// SQLite connection on every edit.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

function getClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

// A lazy proxy, not `createClient()` called directly at module scope.
// Next.js's build step imports every route module to collect its
// metadata/config (Route Handlers, dynamic params, etc.) — including in
// environments where DATABASE_URL isn't set yet, like a Docker build
// stage (no .env in that build context, deliberately, since it's not
// meant to hold secrets). Found via a real `docker build` on the actual
// home-lab host: every route importing this module failed at build time
// with "DATABASE_URL is not set", even though nothing had actually
// tried to query the database — just importing the module blew up.
// This proxy defers real client creation until the first actual property
// access (i.e. the first real query at request time), so importing the
// module is always safe regardless of whether DATABASE_URL exists yet.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    return Reflect.get(client, prop, client);
  },
});
