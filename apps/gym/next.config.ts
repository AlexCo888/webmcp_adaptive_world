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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.lifefitness.com" },
      { protocol: "https", hostname: "assets.roguefitness.com" },
      { protocol: "https", hostname: "media.eleiko.com" },
    ],
  },
};

export default nextConfig;
