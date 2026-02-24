import path from 'path';
import type { NextConfig } from 'next';

const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../'),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
