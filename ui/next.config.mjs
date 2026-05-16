import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ['better-sqlite3', 'bindings'],
  // Hide the floating Next.js dev indicator in the corner; we have our own UI chrome.
  devIndicators: false,
  webpack: (config, { isServer }) => {
    if (isServer) {
      // `better-sqlite3` -> `bindings` resolves its native `.node` by parsing
      // Error().stack. Webpack bundling destroys those stack paths and produces
      // `Cannot read properties of undefined (reading 'indexOf')`. Force them
      // to load via require() at runtime.
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean);
      externals.push({
        'better-sqlite3': 'commonjs better-sqlite3',
        bindings: 'commonjs bindings',
      });
      config.externals = externals;
    }
    return config;
  },
};

export default nextConfig;
