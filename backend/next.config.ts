import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../'),
  serverExternalPackages: ['playwright', 'cheerio', 'exceljs', 'mongodb', 'pdf-parse'],
  webpack: (config, { isServer }) => {
    if (isServer) {
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
