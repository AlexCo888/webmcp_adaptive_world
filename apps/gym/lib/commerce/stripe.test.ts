import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { CommerceError } from "./http";
import type { StripeSetup } from "./stripe";
import {
  isStripeCheckoutAlreadyTerminalized,
  resolveStripeDuplicateRefund,
  resolveStripeSessionAttachAction,
  resolveStripeSetupClaimAction,
  retrieveOrCreateStripeRefund,
  shouldAttemptDuplicateStripeRefund,
} from "./stripe-policy";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/adaptive_world_test";

const setup = {
  providerResourceId: null,
  idempotencyReplayUntil: new Date("2026-08-29T23:00:00.000Z"),
} as StripeSetup;

const verificationSetup: StripeSetup = {
  ...setup,
  id: "00000000-0000-4000-8000-000000000010",
  requestParams: {
    mode: "payment",
    line_items: [{ price: "price_test_routine_pro", quantity: 1 }],
    success_url: "https://gym.example/session?routinePro=success&order=awrp_test",
    cancel_url: "https://gym.example/session?routinePro=cancelled&order=awrp_test",
    client_reference_id: "awrp_test",
    metadata: {
      publicRef: "awrp_test",
      productKey: "adaptive_world.routine_pro.v1",
      sandbox: "true",
    },
    expires_at: 1_788_045_600,
    integration_identifier: "adaptive_world_abcdefgh",
  },
};

const validSession = {
  id: "cs_test_same",
  amount_total: 499,
  client_reference_id: "awrp_test",
  created: 1_788_042_000,
  currency: "usd",
  expires_at: 1_788_045_600,
  integration_identifier: "adaptive_world_abcdefgh",
  livemode: false,
  metadata: {
    publicRef: "awrp_test",
    productKey: "adaptive_world.routine_pro.v1",
    sandbox: "true",
  },
  mode: "payment",
  url: "https://checkout.stripe.com/c/pay/cs_test_same",
} as unknown as Stripe.Checkout.Session;

describe("Stripe setup replay cutoff", () => {
  it("never reclaims a setup after its order was cancelled or reset", () => {
    const common = {
      activeProviderSetupId: "setup-1",
      orderProvider: "stripe_checkout",
      setupId: "setup-1",
      setupStatus: "requesting",
    };
    expect(resolveStripeSetupClaimAction({ ...common, orderStatus: "voided" })).toBe("expired");
    expect(
      resolveStripeSetupClaimAction({
        ...common,
        orderStatus: "provider_pending",
        setupStatus: "failed_terminal",
      }),
    ).toBe("expired");
    expect(resolveStripeSetupClaimAction({ ...common, orderStatus: "provider_pending" })).toBe(
      "active",
    );
  });

  it("does not expire a winning caller's session after lease takeover", () => {
    const common = {
      activeProviderSetupId: "setup-1",
      claimantLeaseOwnerHash: "stale-lease",
      orderProvider: "stripe_checkout",
      orderStatus: "provider_pending",
      providerResourceId: null,
      sessionId: "cs_test_same",
      setupId: "setup-1",
      setupLeaseOwnerHash: "winning-lease",
      setupStatus: "requesting",
    };
    expect(resolveStripeSessionAttachAction(common)).toBe("pending");
    expect(
      resolveStripeSessionAttachAction({
        ...common,
        providerResourceId: "cs_test_same",
        setupStatus: "attached",
      }),
    ).toBe("already_attached");
  });

  it("accepts cancel and expiry webhook terminal labels as cross-path idempotent", () => {
    const common = {
      providerResourceId: "cs_test_same",
      sessionId: "cs_test_same",
      setupStatus: "failed_terminal",
    };
    expect(isStripeCheckoutAlreadyTerminalized({ ...common, orderStatus: "voided" })).toBe(true);
    expect(isStripeCheckoutAlreadyTerminalized({ ...common, orderStatus: "expired" })).toBe(true);
  });

  it("reuses the provider call before the conservative cutoff", async () => {
    const { createStripeSessionOnlyWhenReplaySafe } = await import("./stripe");
    const create = vi.fn(() => Promise.resolve({ id: "cs_test_same" } as never));
    await createStripeSessionOnlyWhenReplaySafe({
      setup,
      now: new Date("2026-08-29T22:59:59.999Z"),
      create,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("makes zero Stripe create calls at or after the cutoff", async () => {
    const { createStripeSessionOnlyWhenReplaySafe } = await import("./stripe");
    const create = vi.fn(() => Promise.resolve({ id: "cs_test_new" } as never));
    await expect(
      createStripeSessionOnlyWhenReplaySafe({
        setup,
        now: new Date("2026-08-29T23:00:00.000Z"),
        create,
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_SETUP_RECONCILIATION_REQUIRED",
    } satisfies Partial<CommerceError>);
    expect(create).not.toHaveBeenCalled();
  });

  it("durably marks a provider response mismatch before failing closed", async () => {
    const { verifyStripeCheckoutSessionWithReconciliation } = await import("./stripe");
    const markReconciliation = vi.fn(() => Promise.resolve());

    await expect(
      verifyStripeCheckoutSessionWithReconciliation({
        session: { ...validSession, livemode: true },
        setup: verificationSetup,
        markReconciliation,
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_SETUP_RECONCILIATION_REQUIRED",
    } satisfies Partial<CommerceError>);
    expect(markReconciliation).toHaveBeenCalledOnce();
    expect(markReconciliation).toHaveBeenCalledWith("STRIPE_SESSION_RESPONSE_MISMATCH");
  });
});

describe("duplicate Stripe refund recovery", () => {
  it("retries the same idempotent refund after a crash leaves refund pending", () => {
    expect(
      shouldAttemptDuplicateStripeRefund("idempotent", {
        provider: "stripe_checkout",
        status: "refund_pending",
      }),
    ).toBe(true);
    expect(
      shouldAttemptDuplicateStripeRefund("idempotent", {
        provider: "stripe_checkout",
        status: "refunded",
      }),
    ).toBe(false);
    expect(
      shouldAttemptDuplicateStripeRefund("duplicate_paid", {
        provider: "mpp_tempo",
        status: "duplicate_paid",
      }),
    ).toBe(false);
  });

  it("advances a retrieved pending refund to succeeded without creating another refund", () => {
    const order = {
      amountMinor: 499,
      currency: "usd",
      provider: "stripe_checkout" as const,
      providerPaymentRef: "pi_test_duplicate",
      refundReference: "re_test_duplicate",
      status: "refund_pending" as const,
    };
    const refund = {
      amount: 499,
      currency: "usd",
      id: "re_test_duplicate",
      object: "refund",
      payment_intent: "pi_test_duplicate",
      status: "pending",
    } as Stripe.Refund;

    expect(resolveStripeDuplicateRefund({ order, refund })).toEqual({
      failureCode: "DUPLICATE_REFUND_PENDING",
      outcome: "pending",
      persistReference: true,
    });
    expect(
      resolveStripeDuplicateRefund({
        order,
        refund: { ...refund, status: "succeeded" },
      }),
    ).toEqual({ failureCode: null, outcome: "refunded", persistReference: true });
  });

  it("retrieves the persisted refund instead of replaying its create request", async () => {
    const current = {
      id: "re_test_duplicate",
      object: "refund",
      status: "succeeded",
    } as Stripe.Refund;
    const create = vi.fn<() => Promise<Stripe.Refund>>();
    const retrieve = vi.fn<(id: string) => Promise<Stripe.Refund>>(() => Promise.resolve(current));

    await expect(
      retrieveOrCreateStripeRefund({
        create,
        refundReference: current.id,
        retrieve,
      }),
    ).resolves.toBe(current);
    expect(retrieve).toHaveBeenCalledOnce();
    expect(retrieve).toHaveBeenCalledWith(current.id);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a refund whose persisted provider identity does not match", () => {
    const resolution = resolveStripeDuplicateRefund({
      order: {
        amountMinor: 499,
        currency: "usd",
        provider: "stripe_checkout",
        providerPaymentRef: "pi_test_duplicate",
        refundReference: "re_expected",
        status: "refund_pending",
      },
      refund: {
        amount: 499,
        currency: "usd",
        id: "re_other",
        object: "refund",
        payment_intent: "pi_test_duplicate",
        status: "succeeded",
      } as Stripe.Refund,
    });

    expect(resolution).toEqual({
      failureCode: "DUPLICATE_REFUND_IDENTITY_MISMATCH",
      outcome: "reconciliation_required",
      persistReference: false,
    });
  });
});
