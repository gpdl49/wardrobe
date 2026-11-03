import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/lib/env";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

/**
 * The shared Prisma client (lazily created, survives dev hot reloads). TLS
 * comes from the URL or PGSSLMODE, as node-pg does by default.
 */
export function db(): PrismaClient {
	globalForPrisma.prisma ??= new PrismaClient({
		adapter: new PrismaPg({ connectionString: env().DATABASE_URL }),
	});
	return globalForPrisma.prisma;
}

/** Tests only: drop the client so the next db() reconnects. */
export async function disconnectDb(): Promise<void> {
	await globalForPrisma.prisma?.$disconnect();
	globalForPrisma.prisma = undefined;
}

export type { Prisma } from "@/lib/generated/prisma/client";
