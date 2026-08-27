import { betterAuth } from "better-auth";
import { Pool } from "pg";

const buildOnly = process.env.NEXT_PHASE === "phase-production-build" || process.env.CI === "true";

function requiredEnvironment(name: string, buildFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (buildOnly) return buildFallback;
  throw new Error(`${name} is required at runtime`);
}

const databaseUrl = requiredEnvironment(
  "DATABASE_URL",
  "postgresql://build:build@127.0.0.1:5432/adaptive_world_build",
);

const globalForAuth = globalThis as typeof globalThis & { adaptiveAuthPool?: Pool };
const pool =
  globalForAuth.adaptiveAuthPool ??
  new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalForAuth.adaptiveAuthPool = pool;

const passportUrl =
  process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_PASSPORT_URL ?? "http://127.0.0.1:3000";

export const auth = betterAuth({
  appName: "Adaptive World Passport",
  database: pool,
  secret: requiredEnvironment(
    "BETTER_AUTH_SECRET",
    "adaptive-world-ci-build-secret-at-least-thirty-two-characters",
  ),
  baseURL: passportUrl,
  trustedOrigins: [
    passportUrl,
    process.env.NEXT_PUBLIC_GYM_URL ?? "http://127.0.0.1:3001",
    "https://passport-eosin.vercel.app",
    "https://gym-alpha-amber-89.vercel.app",
  ],
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.SEED_DEMO !== "true",
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});
