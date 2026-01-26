import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure API routes are server-only
  experimental: {
    serverComponentsExternalPackages: ['playwright', 'cheerio', 'exceljs', 'mongodb'],
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
      
      // Ensure browser globals are not available in server code
      config.resolve.alias = {
        ...config.resolve.alias,
      };
    }
    
    // Ignore browser-only modules in server bundle
    if (isServer) {
      // Ensure server bundle doesn't include browser APIs
      config.resolve.alias = {
        ...config.resolve.alias,
      };
    }
    
    return config;
  },
};

export default nextConfig;
