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
};

export default nextConfig;
