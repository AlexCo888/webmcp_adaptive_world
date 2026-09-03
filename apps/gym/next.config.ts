// Production deployment sync marker: 2026-09-02. No runtime behavior change.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@adaptive-world/contracts",
    "@adaptive-world/db",
    "@adaptive-world/demo-data",
    "@adaptive-world/security",
    "@adaptive-world/ui",
    "@adaptive-world/webmcp",
  ],
  poweredByHeader: false,
};

export default nextConfig;
