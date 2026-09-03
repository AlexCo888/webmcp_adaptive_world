// Production deployment sync marker: 2026-09-02. No runtime behavior change.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@adaptive-world/contracts",
    "@adaptive-world/db",
    "@adaptive-world/demo-data",
    "@adaptive-world/security",
    "@adaptive-world/webmcp",
  ],
};

export default nextConfig;
