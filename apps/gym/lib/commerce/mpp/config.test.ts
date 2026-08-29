import assert from "node:assert/strict";

import { it as test } from "vitest";

import { createTempoAgentPaymentAdapter } from "./agent";
import { loadMppProviderConfig, parseMppProviderConfig } from "./config";

test("disabled and incomplete provider configuration fails closed", () => {
  const disabled = parseMppProviderConfig({ enabled: false });
  assert.throws(() => createTempoAgentPaymentAdapter({ config: disabled }), {
    message: "Agent payment is unavailable.",
  });

  assert.throws(
    () =>
      parseMppProviderConfig({
        enabled: true,
        merchantUrl: "https://gym.example/api/commerce/mpp",
        realm: "gym.example",
        scope: "/api/commerce/mpp",
      }),
    { message: "Agent payment is unavailable." },
  );

  const environmentDisabled = loadMppProviderConfig(
    {
      ENABLE_AGENT_MPP_PAYMENT: "true",
      ENABLE_ROUTINE_PRO: "false",
    },
    {
      merchantUrl: "https://gym.example/api/commerce/mpp",
      realm: "gym.example",
      scope: "/api/commerce/mpp",
    },
  );
  assert.deepEqual(environmentDisabled, { enabled: false });
});
