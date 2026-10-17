/** @type {import('next').NextConfig} */
const apiPort = process.env.NEXT_PUBLIC_API_PORT || '8083';
const agentsPort = process.env.NEXT_PUBLIC_AGENTS_PORT || '8091';

const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://127.0.0.1:${apiPort}/api/:path*`,
      },
      {
        source: '/agents/:path*',
        destination: `http://127.0.0.1:${agentsPort}/:path*`,
      },
    ];
  },
  // Increase timeout for long-running requests (like LLM refactoring)
  serverRuntimeConfig: {
    // This doesn't directly control proxy timeout, but helps with overall server config
  },
  // Note: Next.js rewrites don't have a direct timeout config
  // The timeout is controlled by the underlying HTTP client
};

module.exports = nextConfig;
