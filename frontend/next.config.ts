import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "biltph.com",
        pathname: "/**",
      },
    ],
  },
  allowedDevOrigins: ["192.168.1.65", "192.168.1.55", "192.168.1.25"],
  turbopack: {
    root: path.resolve(import.meta.dirname || '.', '..'),
  },
};

export default nextConfig;
