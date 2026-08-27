import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@adaptive-world/contracts",
    "@adaptive-world/demo-data",
    "@adaptive-world/ui",
    "@adaptive-world/webmcp",
  ],
  poweredByHeader: false,
};

export default nextConfig;
