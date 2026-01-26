import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['playwright', 'cheerio'],
  },
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
