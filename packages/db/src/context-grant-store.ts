import type {
  ContextGrantStore,
  NewStoredContextGrant,
  StoredContextGrant,
} from "@adaptive-world/security";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";
import { contextGrants } from "./schema";

function toStored(row: typeof contextGrants.$inferSelect): StoredContextGrant {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    patientId: row.patientId,
    createdByUserId: row.createdByUserId,
    audience: row.audience,
    purpose: row.purpose,
    scopes: row.scopes as StoredContextGrant["scopes"],
    projection: row.projection as unknown as StoredContextGrant["projection"],
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    redeemedAt: row.redeemedAt,
    revokedAt: row.revokedAt,
  };
}

export function createContextGrantStore<TQueryResult extends PgQueryResultHKT>(
  db: Pick<PgDatabase<TQueryResult, typeof schema>, "insert" | "update">,
): ContextGrantStore {
  return {
    async create(input: NewStoredContextGrant) {
      const [row] = await db
        .insert(contextGrants)
        .values({
          tokenHash: input.tokenHash,
          patientId: input.patientId,
          createdByUserId: input.createdByUserId,
          audience: input.audience,
          purpose: input.purpose,
          scopes: [...input.scopes],
          projection: input.projection as unknown as Record<string, unknown>,
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
        })
        .returning();
      if (!row) throw new Error("Context grant was not created");
      return toStored(row);
    },

    async consume(tokenHash: string, expectedAudience: string, now: Date) {
      // One statement is essential: it prevents two concurrent redeemers from
      // both observing an unused token.
      const [row] = await db
        .update(contextGrants)
        .set({ redeemedAt: now })
        .where(
          and(
            eq(contextGrants.tokenHash, tokenHash),
            eq(contextGrants.audience, expectedAudience),
            isNull(contextGrants.redeemedAt),
            isNull(contextGrants.revokedAt),
            gt(contextGrants.expiresAt, now),
          ),
        )
        .returning();
      return row ? toStored(row) : null;
    },

    async revoke(grantId: string, actorUserId: string, now: Date) {
      const rows = await db
        .update(contextGrants)
        .set({ revokedAt: now, revokedByUserId: actorUserId })
        .where(
          and(
            eq(contextGrants.id, grantId),
            eq(contextGrants.createdByUserId, actorUserId),
            isNull(contextGrants.revokedAt),
          ),
        )
        .returning({ id: contextGrants.id });
      return rows.length === 1;
    },
  };
}

/** Set per-request identity only inside a transaction; SET LOCAL resets on commit. */
export async function setRlsIdentity<TQueryResult extends PgQueryResultHKT>(
  tx: Pick<PgDatabase<TQueryResult, typeof schema>, "execute">,
  userId: string,
  role: "patient" | "doctor" | "admin",
): Promise<void> {
  await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
  await tx.execute(sql`select set_config('app.user_role', ${role}, true)`);
}
