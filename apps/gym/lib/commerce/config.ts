import { z } from "zod";

const booleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const PublicConfigSchema = z.object({
  ENABLE_ROUTINE_PRO: booleanFlag,
  ENABLE_STRIPE_TEST_CHECKOUT: booleanFlag,
  ENABLE_AGENT_MPP_PAYMENT: booleanFlag,
  ROUTINE_PRO_PRICE_MINOR: z.coerce
    .number()
    .int()
    .refine((value) => value === 499)
    .default(499),
  ROUTINE_PRO_CURRENCY: z.literal("usd").default("usd"),
  STRIPE_CHECKOUT_WINDOW_MINUTES: z.coerce.number().int().min(35).max(120).default(60),
  DEMO_AGENT_DAILY_BUDGET_MINOR: z.coerce.number().int().min(499).max(50_000).default(5_000),
  NEXT_PUBLIC_GYM_URL: z.string().url().default("http://127.0.0.1:3001"),
});

export type CommerceConfig = {
  enabled: boolean;
  stripeEnabled: boolean;
  agentEnabled: boolean;
  amountMinor: 499;
  currency: "usd";
  checkoutWindowMinutes: number;
  dailyBudgetMinor: number;
  gymOrigin: string;
};

export function getCommerceConfig(): CommerceConfig {
  const parsed = PublicConfigSchema.parse(process.env);
  return {
    enabled: parsed.ENABLE_ROUTINE_PRO,
    stripeEnabled: parsed.ENABLE_ROUTINE_PRO && parsed.ENABLE_STRIPE_TEST_CHECKOUT,
    agentEnabled: parsed.ENABLE_ROUTINE_PRO && parsed.ENABLE_AGENT_MPP_PAYMENT,
    amountMinor: 499,
    currency: "usd",
    checkoutWindowMinutes: parsed.STRIPE_CHECKOUT_WINDOW_MINUTES,
    dailyBudgetMinor: parsed.DEMO_AGENT_DAILY_BUDGET_MINOR,
    gymOrigin: new URL(parsed.NEXT_PUBLIC_GYM_URL).origin,
  };
}

export function requireSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required while its provider is enabled`);
  return value;
}

export function requireStripeTestSecretKey(): string {
  const key = requireSecret("STRIPE_SECRET_KEY");
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe test-mode secret key");
  }
  return key;
}

export function validateCommerceSecrets(): void {
  const config = getCommerceConfig();
  if (!config.enabled) return;
  requireSecret("COMMERCE_CAPABILITY_SECRET");
  if (config.stripeEnabled) {
    requireStripeTestSecretKey();
    requireSecret("STRIPE_WEBHOOK_SECRET");
    requireSecret("STRIPE_ROUTINE_PRO_PRICE_ID");
  }
  if (config.agentEnabled) {
    requireSecret("MPP_SECRET_KEY");
    requireSecret("MPP_TEMPO_RECIPIENT");
    requireSecret("MPP_TEMPO_CURRENCY");
    requireSecret("DEMO_AGENT_PRIVATE_KEY");
  }
}
