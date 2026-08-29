import { parseMppProviderConfig, type EnabledMppProviderConfig } from "./config";
import { parsePersistedTempoPaymentSnapshot, type PersistedTempoPaymentSnapshot } from "./snapshot";

export const TEST_CAPABILITY_SECRET = "capability-secret-for-focused-tests";

export function mppTestConfig(): EnabledMppProviderConfig {
  const config = parseMppProviderConfig({
    enabled: true,
    capabilitySecret: TEST_CAPABILITY_SECRET,
    demoAgentPrivateKey: `0x${"11".repeat(32)}`,
    merchantUrl: "https://gym.example/api/commerce/mpp",
    realm: "gym.example",
    scope: "/api/commerce/mpp",
    secretKey: "mpp-challenge-secret-for-tests-32",
    tempoCurrency: "0x20c0000000000000000000000000000000000001",
    tempoRecipient: "0x1111111111111111111111111111111111111111",
  });
  if (!config.enabled) throw new TypeError("Expected enabled test configuration");
  return config;
}

export function mppTestSnapshot(): PersistedTempoPaymentSnapshot {
  return parsePersistedTempoPaymentSnapshot({
    snapshotVersion: 1,
    orderId: "00000000-0000-4000-8000-000000000001",
    publicRef: "ord_routine_pro_test_1",
    provider: "mpp_tempo",
    productKey: "adaptive_world.routine_pro.v1",
    amountMinor: 499,
    currency: "usd",
    amountDecimal: "4.99",
    tempoAmountAtomic: "4990000",
    tempoCurrency: "0x20c0000000000000000000000000000000000001",
    tempoRecipient: "0x1111111111111111111111111111111111111111",
    tempoDecimals: 6,
    chainId: 42_431,
    realm: "gym.example",
    merchantUrl: "https://gym.example/api/commerce/mpp",
    scope: "/api/commerce/mpp",
    capabilityVersion: 1,
    capabilityExpiresAt: "2099-08-29T12:00:00.000Z",
  });
}
