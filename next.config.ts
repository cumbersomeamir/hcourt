import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure API routes are server-only (Next.js 15.5.9+ uses serverExternalPackages)
  serverExternalPackages: ['playwright', 'cheerio', 'exceljs', 'mongodb'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude browser-only APIs from server bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;
