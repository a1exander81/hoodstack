import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

/**
 * Resolves the singleton, constructing it on first call.
 *
 * Development caches on globalThis so hot reloads reuse one client, as
 * before. Production does not: each lambda gets its own instance.
 */
function resolveClient(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    return (productionClient ??= createPrismaClient());
  }
  return (globalForPrisma.prisma ??= createPrismaClient());
}

let productionClient: PrismaClient | undefined;

/**
 * A Proxy, not a PrismaClient instance. Importing this module is free; the
 * client is built on the first property access, so Next's build-time
 * "Collecting page data" step -- which imports every route module without
 * querying -- no longer requires DATABASE_URL. A missing DATABASE_URL still
 * throws, at the first real database access, which is where it is
 * diagnosable.
 *
 * Functions are bound to the resolved client. Returning them unbound (or
 * passing the Proxy as Reflect.get's receiver) makes `this` the Proxy inside
 * the method, which throws on any private-field access -- that breaks
 * $queryRaw and $executeRaw specifically, which services/rng and the
 * ledger's advisory lock both depend on.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = resolveClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, prop) {
    return prop in resolveClient();
  },
  set(_target, prop, value) {
    const client = resolveClient();
    return Reflect.set(client, prop, value, client);
  },
});
