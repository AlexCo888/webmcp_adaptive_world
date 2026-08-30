import assert from "node:assert/strict";
import test from "node:test";

import { ConfirmRoutineRequestSchema, RoutineProOfferSchema } from "./commerce";

void test("commerce requests reject client-selected authority fields", () => {
  const parsed = ConfirmRoutineRequestSchema.safeParse({
    templateId: "first_visit_foundations",
    goal: "Support lifelong health",
    paymentMode: "human_checkout",
    quoteValidUntil: "2026-08-29T12:00:00.000Z",
    quoteDigest: "a".repeat(64),
    amountMinor: 1,
  });
  assert.equal(parsed.success, false);
});

void test("the public offer is fixed to the one sandbox product", () => {
  const parsed = RoutineProOfferSchema.safeParse({
    productKey: "adaptive_world.routine_pro.v1",
    displayName: "Adaptive Routine Pro",
    amountMinor: 499,
    currency: "usd",
    sandbox: true,
    entitled: false,
    supportedModes: ["human_checkout"],
    quoteValidUntil: "2026-08-29T12:00:00.000Z",
    quoteDigest: "b".repeat(64),
  });
  assert.equal(parsed.success, true);
});
