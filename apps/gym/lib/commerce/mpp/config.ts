import { Buffer } from "node:buffer";

import { z } from "zod";

import { TEMPO_TESTNET_CHAIN_ID } from "./constants";
import { MppAdapterError } from "./errors";

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u);
const PrivateKeySchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/u);
const SecretSchema = z
  .string()
  .refine((secret) => Buffer.byteLength(secret, "utf8") >= 32, "Secret must be at least 32 bytes");

const EnabledConfigSchema = z
  .object({
    enabled: z.literal(true),
    realm: z.string().trim().min(1).max(255),
    merchantUrl: z.string().url(),
    scope: z.string().startsWith("/").max(512),
    secretKey: SecretSchema,
    capabilitySecret: SecretSchema,
    tempoRecipient: AddressSchema,
    tempoCurrency: AddressSchema,
    demoAgentPrivateKey: PrivateKeySchema,
    chainId: z.literal(TEMPO_TESTNET_CHAIN_ID).default(TEMPO_TESTNET_CHAIN_ID),
  })
  .strict()
  .superRefine(({ merchantUrl, realm, scope }, context) => {
    const url = new URL(merchantUrl);
    const localHttp = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) {
      context.addIssue({
        code: "custom",
        message: "The MPP merchant URL must use HTTPS outside localhost",
        path: ["merchantUrl"],
      });
    }
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.toString() !== merchantUrl
    ) {
      context.addIssue({
        code: "custom",
        message: "The MPP merchant URL must be canonical and contain no credentials or query",
        path: ["merchantUrl"],
      });
    }
    if (url.host !== realm) {
      context.addIssue({
        code: "custom",
        message: "The MPP realm must equal the merchant host",
        path: ["realm"],
      });
    }
    if (url.pathname !== scope) {
      context.addIssue({
        code: "custom",
        message: "The merchant URL pathname must equal the route scope",
        path: ["scope"],
      });
    }
  });

export type EnabledMppProviderConfig = Readonly<z.infer<typeof EnabledConfigSchema>>;
export type MppProviderConfig = Readonly<{ enabled: false }> | EnabledMppProviderConfig;

export type MppProviderConfigInput = Partial<
  Omit<z.input<typeof EnabledConfigSchema>, "enabled">
> & {
  enabled: boolean;
};

export function parseMppProviderConfig(input: MppProviderConfigInput): MppProviderConfig {
  if (!input.enabled) return Object.freeze({ enabled: false });

  const parsed = EnabledConfigSchema.safeParse(input);
  if (!parsed.success) throw new MppAdapterError("PROVIDER_UNAVAILABLE");

  return Object.freeze({
    ...parsed.data,
    tempoRecipient: parsed.data.tempoRecipient.toLowerCase() as `0x${string}`,
    tempoCurrency: parsed.data.tempoCurrency.toLowerCase() as `0x${string}`,
  });
}

export function requireEnabledMppProvider(config: MppProviderConfig): EnabledMppProviderConfig {
  if (!config.enabled) throw new MppAdapterError("PROVIDER_UNAVAILABLE");
  return config;
}

export type MppEnvironment = Readonly<Record<string, string | undefined>>;

function readBooleanFlag(value: string | undefined): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new MppAdapterError("PROVIDER_UNAVAILABLE");
}

export function loadMppProviderConfig(
  environment: MppEnvironment,
  route: Readonly<{ merchantUrl: string; realm: string; scope: string }>,
): MppProviderConfig {
  const routineProEnabled = readBooleanFlag(environment.ENABLE_ROUTINE_PRO);
  const mppEnabled = readBooleanFlag(environment.ENABLE_AGENT_MPP_PAYMENT);

  return parseMppProviderConfig({
    enabled: routineProEnabled && mppEnabled,
    realm: route.realm,
    merchantUrl: route.merchantUrl,
    scope: route.scope,
    secretKey: environment.MPP_SECRET_KEY ?? "",
    capabilitySecret: environment.COMMERCE_CAPABILITY_SECRET ?? "",
    tempoRecipient: environment.MPP_TEMPO_RECIPIENT ?? "",
    tempoCurrency: environment.MPP_TEMPO_CURRENCY ?? "",
    demoAgentPrivateKey: environment.DEMO_AGENT_PRIVATE_KEY ?? "",
    chainId: TEMPO_TESTNET_CHAIN_ID,
  });
}
