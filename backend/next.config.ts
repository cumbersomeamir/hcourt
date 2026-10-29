import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
      { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
    ] }];
  },
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
