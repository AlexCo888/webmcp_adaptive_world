import { createHmac } from "node:crypto";

import { DEMO_AGENT_SUBJECT } from "./constants";
import { requireSecret } from "./config";
import { withCommerceTransaction } from "./database";
import { CommerceError } from "./http";

type Dimension = "session" | "order" | "ip" | "agent";

type LimitDimension = Readonly<{
  dimension: Dimension;
  limit: number;
  value: string;
}>;

const WINDOW_SECONDS = 10 * 60;

function keyedHash(dimension: Dimension, value: string): string {
  return createHmac("sha256", requireSecret("COMMERCE_CAPABILITY_SECRET"))
    .update(dimension)
    .update("\0")
    .update(value)
    .digest("hex");
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const candidate = forwarded || request.headers.get("x-real-ip")?.trim() || "unavailable";
  return candidate.slice(0, 128);
}

export async function rateLimitPaymentRequest(
  request: Request,
  authority: Readonly<{
    sessionId: string;
    orderRef?: string;
    agent?: boolean;
  }>,
): Promise<void> {
  const dimensions: LimitDimension[] = [
    { dimension: "session", value: authority.sessionId, limit: 20 },
    ...(authority.orderRef
      ? ([{ dimension: "order", value: authority.orderRef, limit: 20 }] as const)
      : []),
    { dimension: "ip", value: clientAddress(request), limit: 80 },
    ...(authority.agent
      ? ([{ dimension: "agent", value: DEMO_AGENT_SUBJECT, limit: 30 }] as const)
      : []),
  ];

  await applyRateLimits(dimensions);
}

export async function rateLimitPaymentOrder(orderRef: string): Promise<void> {
  await applyRateLimits([{ dimension: "order", value: orderRef, limit: 20 }]);
}

async function applyRateLimits(dimensions: readonly LimitDimension[]): Promise<void> {
  const blocked = await withCommerceTransaction(async (client) => {
    let exceeded = false;
    for (const item of dimensions) {
      const result = await client.query<{ hit_count: number }>(
        `INSERT INTO commerce_rate_limits (
           key_hash, dimension, hit_count, window_started_at, expires_at
         ) VALUES ($1,$2,1,clock_timestamp(),clock_timestamp() + $3::int * interval '1 second')
         ON CONFLICT (key_hash) DO UPDATE SET
           dimension = EXCLUDED.dimension,
           hit_count = CASE
             WHEN commerce_rate_limits.expires_at <= clock_timestamp() THEN 1
             ELSE commerce_rate_limits.hit_count + 1
           END,
           window_started_at = CASE
             WHEN commerce_rate_limits.expires_at <= clock_timestamp()
               THEN clock_timestamp()
             ELSE commerce_rate_limits.window_started_at
           END,
           expires_at = CASE
             WHEN commerce_rate_limits.expires_at <= clock_timestamp()
               THEN clock_timestamp() + $3::int * interval '1 second'
             ELSE commerce_rate_limits.expires_at
           END
         RETURNING hit_count`,
        [keyedHash(item.dimension, item.value), item.dimension, WINDOW_SECONDS],
      );
      if ((result.rows[0]?.hit_count ?? item.limit + 1) > item.limit) exceeded = true;
    }
    return exceeded;
  });

  if (blocked) throw new CommerceError("RATE_LIMITED", true);
}
