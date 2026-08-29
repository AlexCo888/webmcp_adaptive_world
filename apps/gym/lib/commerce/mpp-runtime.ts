import type { PersistedTempoPaymentSnapshot } from "./mpp";
import {
  createPostgresAtomicStore,
  parseMppProviderConfig,
  type MppProviderConfig,
  type PostgresAtomicStoreDatabase,
  type PostgresQuery,
} from "./mpp";
import { requireSecret } from "./config";
import { commercePool, withCommerceTransaction } from "./database";

const poolQuery: PostgresQuery = (sql, parameters = []) => commercePool.query(sql, [...parameters]);

const database: PostgresAtomicStoreDatabase = {
  query: poolQuery,
  withTransaction: (run) =>
    withCommerceTransaction((client) => {
      const transactionQuery: PostgresQuery = (sql, parameters = []) =>
        client.query(sql, [...parameters]);
      return run(transactionQuery);
    }),
};

export const mppAtomicStore = createPostgresAtomicStore(database, {
  keyPrefix: "routine-pro:",
});

/**
 * Existing prepared orders continue from their immutable provider snapshot.
 * Runtime secrets may rotate, but routing, asset, recipient, amount, and expiry
 * never get rebuilt from mutable environment configuration.
 */
export function mppConfigForSnapshot(snapshot: PersistedTempoPaymentSnapshot): MppProviderConfig {
  return parseMppProviderConfig({
    enabled: true,
    realm: snapshot.realm,
    merchantUrl: snapshot.merchantUrl,
    scope: snapshot.scope,
    secretKey: requireSecret("MPP_SECRET_KEY"),
    capabilitySecret: requireSecret("COMMERCE_CAPABILITY_SECRET"),
    tempoRecipient: snapshot.tempoRecipient,
    tempoCurrency: snapshot.tempoCurrency,
    demoAgentPrivateKey: requireSecret("DEMO_AGENT_PRIVATE_KEY"),
    chainId: snapshot.chainId,
  });
}
