import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["recharts"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
