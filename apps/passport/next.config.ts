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
