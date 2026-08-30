const POSTGRES_PROTOCOLS = new Set(["postgresql:", "postgres:"]);
const LEGACY_VERIFY_FULL_ALIASES = new Set(["prefer", "require", "verify-ca"]);

/**
 * Preserve node-postgres' current certificate-verifying behavior explicitly.
 *
 * pg-connection-string currently treats these three sslmode values as
 * verify-full, but has announced weaker libpq-compatible semantics for its next
 * major release. Normalizing them here removes the runtime warning and prevents
 * that upgrade from silently weakening TLS verification.
 */
export function normalizePostgresConnectionUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new TypeError("A PostgreSQL connection URL is required");
  }

  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode && LEGACY_VERIFY_FULL_ALIASES.has(sslMode.toLowerCase())) {
    parsed.searchParams.set("sslmode", "verify-full");
  }

  return parsed.toString();
}
