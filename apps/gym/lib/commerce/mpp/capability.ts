import {
  createRoutineProCapability,
  digestRoutineProCapability,
  verifyRoutineProCapability,
  verifySha256Hex,
  type RoutineProCapabilityAuthority,
} from "@adaptive-world/security";

import { MppAdapterError } from "./errors";
import { parsePersistedTempoPaymentSnapshot, type PersistedTempoPaymentSnapshot } from "./snapshot";

export type OrderCapability = string & { readonly __orderCapability: unique symbol };

/** Uses the same immutable authority as the shared commerce capability. */
export function orderCapabilityAuthority(snapshotInput: unknown): RoutineProCapabilityAuthority {
  const snapshot = parsePersistedTempoPaymentSnapshot(snapshotInput);
  return Object.freeze({
    amountMinor: snapshot.amountMinor,
    capabilityExpiresAt: snapshot.capabilityExpiresAt,
    capabilityVersion: snapshot.capabilityVersion,
    currency: snapshot.currency,
    productKey: snapshot.productKey,
    publicRef: snapshot.publicRef,
  });
}

export async function regenerateOrderCapability(
  snapshotInput: unknown,
  capabilitySecret: string,
): Promise<OrderCapability> {
  try {
    return (await createRoutineProCapability(
      orderCapabilityAuthority(snapshotInput),
      capabilitySecret,
    )) as OrderCapability;
  } catch {
    throw new MppAdapterError("PROVIDER_UNAVAILABLE");
  }
}

export async function digestOrderCapability(capability: string): Promise<string> {
  return digestRoutineProCapability(capability);
}

export async function verifyOrderCapability(
  parameters: Readonly<{
    capability: string;
    capabilityDigest: string;
    capabilitySecret: string;
    now: Date;
    snapshot: unknown;
  }>,
): Promise<PersistedTempoPaymentSnapshot> {
  const snapshot = parsePersistedTempoPaymentSnapshot(parameters.snapshot);
  const [validCapability, validDigest] = await Promise.all([
    verifyRoutineProCapability(parameters.capability, orderCapabilityAuthority(snapshot), {
      now: parameters.now,
      secret: parameters.capabilitySecret,
    }),
    verifySha256Hex(parameters.capability, parameters.capabilityDigest),
  ]);

  if (!validDigest || !validCapability) {
    throw new MppAdapterError("PAYMENT_FAILED");
  }

  return snapshot;
}
