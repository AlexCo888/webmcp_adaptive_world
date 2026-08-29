import { createHmac, timingSafeEqual } from "node:crypto";
import type { RoutinePaymentModeSchema, RoutineProOffer } from "@adaptive-world/contracts";
import type { z } from "zod";
import { QUOTE_WINDOW_MS, ROUTINE_PRO } from "./constants";
import { getCommerceConfig, requireSecret } from "./config";

type PaymentMode = z.infer<typeof RoutinePaymentModeSchema>;

function quotePayload({
  sessionId,
  entitled,
  supportedModes,
  validUntil,
}: {
  sessionId: string;
  entitled: boolean;
  supportedModes: PaymentMode[];
  validUntil: string;
}) {
  return [
    "routine-pro-quote-v1",
    sessionId,
    ROUTINE_PRO.productKey,
    ROUTINE_PRO.amountMinor,
    ROUTINE_PRO.currency,
    entitled ? "entitled" : "payment-required",
    supportedModes.join(","),
    validUntil,
  ].join("|");
}

function digest(payload: string): string {
  return createHmac("sha256", requireSecret("COMMERCE_CAPABILITY_SECRET"))
    .update(payload)
    .digest("hex");
}

export function createRoutineProOffer({
  sessionId,
  entitled,
  now = new Date(),
}: {
  sessionId: string;
  entitled: boolean;
  now?: Date;
}): RoutineProOffer {
  const config = getCommerceConfig();
  const supportedModes: PaymentMode[] = [];
  if (config.stripeEnabled) supportedModes.push("human_checkout");
  if (config.agentEnabled) supportedModes.push("agent_wallet");
  const quoteValidUntil = new Date(now.getTime() + QUOTE_WINDOW_MS).toISOString();
  const quoteDigest = digest(
    quotePayload({ sessionId, entitled, supportedModes, validUntil: quoteValidUntil }),
  );
  return {
    productKey: ROUTINE_PRO.productKey,
    displayName: ROUTINE_PRO.displayName,
    amountMinor: ROUTINE_PRO.amountMinor,
    currency: ROUTINE_PRO.currency,
    sandbox: ROUTINE_PRO.sandbox,
    entitled,
    supportedModes,
    quoteValidUntil,
    quoteDigest,
  };
}

export function verifyRoutineProQuote({
  sessionId,
  entitled,
  supportedModes,
  quoteValidUntil,
  quoteDigest,
  now = new Date(),
}: {
  sessionId: string;
  entitled: boolean;
  supportedModes: PaymentMode[];
  quoteValidUntil: string;
  quoteDigest: string;
  now?: Date;
}): boolean {
  if (Date.parse(quoteValidUntil) <= now.getTime()) return false;
  const expected = Buffer.from(
    digest(quotePayload({ sessionId, entitled, supportedModes, validUntil: quoteValidUntil })),
    "hex",
  );
  const supplied = Buffer.from(quoteDigest, "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
