import { afterEach, describe, expect, it } from "vitest";
import { requireStripeTestSecretKey } from "./config";

const originalKey = process.env.STRIPE_SECRET_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalKey;
});

describe("Stripe sandbox key enforcement", () => {
  it.each(["sk_test_example", "rk_test_example"])("accepts test-mode key %s", (key) => {
    process.env.STRIPE_SECRET_KEY = key;
    expect(requireStripeTestSecretKey()).toBe(key);
  });

  it.each(["sk_live_example", "rk_live_example"])("rejects live-mode key %s", (key) => {
    process.env.STRIPE_SECRET_KEY = key;
    expect(() => requireStripeTestSecretKey()).toThrow(/test-mode/u);
  });
});
