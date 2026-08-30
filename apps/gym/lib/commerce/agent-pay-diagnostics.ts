import { CommerceError } from "./http";
import { MppAdapterError } from "./mpp";

const REQUIRED_ENVIRONMENT = new Set([
  "COMMERCE_CAPABILITY_SECRET",
  "DEMO_AGENT_PRIVATE_KEY",
  "MPP_SECRET_KEY",
  "MPP_TEMPO_CURRENCY",
  "MPP_TEMPO_RECIPIENT",
]);

function errorRecord(error: unknown): Record<string, unknown> | null {
  return error !== null && typeof error === "object" ? (error as Record<string, unknown>) : null;
}

export function isAgentPaymentConfigurationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === "Routine Pro capability secrets must contain at least 32 bytes") {
    return true;
  }
  const missing = /^([A-Z][A-Z0-9_]*) is required while its provider is enabled$/u.exec(
    error.message,
  );
  return Boolean(missing?.[1] && REQUIRED_ENVIRONMENT.has(missing[1]));
}

/**
 * Runtime diagnostics deliberately expose only closed error classes, SQLSTATE,
 * constraint names, or allowlisted environment variable names. Raw messages,
 * queries, parameters, addresses, and credential values never enter logs.
 */
export function safeAgentPaymentFailureCause(error: unknown): string {
  if (error instanceof CommerceError) return `commerce:${error.code}`;
  if (error instanceof MppAdapterError) {
    return error.diagnosticStage
      ? `mpp:${error.safeCode}:${error.diagnosticStage}`
      : `mpp:${error.safeCode}`;
  }
  if (error instanceof Error) {
    if (error.message === "Routine Pro capability secrets must contain at least 32 bytes") {
      return "configuration:COMMERCE_CAPABILITY_SECRET_TOO_SHORT";
    }
    const missing = /^([A-Z][A-Z0-9_]*) is required while its provider is enabled$/u.exec(
      error.message,
    );
    if (missing?.[1] && REQUIRED_ENVIRONMENT.has(missing[1])) {
      return `configuration:${missing[1]}_MISSING`;
    }
  }

  const record = errorRecord(error);
  const sqlState = typeof record?.code === "string" ? record.code : "";
  if (/^[0-9A-Z]{5}$/u.test(sqlState)) {
    const constraint = typeof record?.constraint === "string" ? record.constraint : "";
    return /^[a-zA-Z0-9_]{1,128}$/u.test(constraint)
      ? `database:${sqlState}:${constraint}`
      : `database:${sqlState}`;
  }

  const name =
    error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(error.name)
      ? error.name
      : "UnknownError";
  return `unexpected:${name}`;
}
