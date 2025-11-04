import { createRequire } from 'node:module';

import type { NextConfig } from 'next';

import initializeBundleAnalyzer from '@next/bundle-analyzer';

// https://www.npmjs.com/package/@next/bundle-analyzer
const withBundleAnalyzer = initializeBundleAnalyzer({
    enabled: process.env.BUNDLE_ANALYZER_ENABLED === 'true'
});

/**
 * Dual Deployment Configuration
 *
 * Supports two deployment modes:
 * 1. standalone: Docker deployment with API proxy (default)
 * 2. appwrite: Static export for Appwrite cloud hosting
 */
const deploymentMode = (process.env.DEPLOYMENT_MODE || process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || 'standalone').toLowerCase();
const isStandalone = deploymentMode === 'standalone';
const isAppwrite = deploymentMode === 'appwrite';

const require = createRequire(import.meta.url);
const standaloneAppwriteAlias = require.resolve('./src/lib/appwrite-standalone');

// https://nextjs.org/docs/pages/api-reference/next-config-js
const nextConfig: NextConfig = {
    // Output mode: standalone for Docker, export for Appwrite
    output: isStandalone ? 'standalone' : isAppwrite ? 'export' : undefined,

    env: {
        NEXT_PUBLIC_DEPLOYMENT_MODE: isStandalone ? 'standalone' : isAppwrite ? 'appwrite' : deploymentMode,
    },

    modularizeImports: {
        '@radix-ui/react-icons': {
            transform: '@radix-ui/react-icons/{{member}}',
        },
    },

    // Rewrites for standalone mode (proxy /api to backend)
    ...(isStandalone && {
        async rewrites() {
            const backendUrl = process.env.BACKEND_URL || 'http://backend:80';
            return [
                {
                    source: '/api/:path*',
                    destination: `${backendUrl}/api/:path*`,
                },
            ];
        },
    }),

    // Image optimization disabled for static export
    ...(isAppwrite && {
        images: {
            unoptimized: true,
        },
    }),

    // Enable React strict mode
    reactStrictMode: true,

    // Experimental features
    experimental: {
        // Enable optimistic client cache for better performance
        optimisticClientCache: true,
        // Enable package-level tree shaking for large UI icon libraries
        optimizePackageImports: ['@radix-ui/react-icons'],
    },

    turbopack: isStandalone
        ? {
              resolveAlias: {
                  appwrite$: standaloneAppwriteAlias,
              },
          }
        : undefined,

    webpack: (config) => {
        if (isStandalone) {
            config.resolve = config.resolve || {};
            config.resolve.alias = config.resolve.alias || {};
            config.resolve.alias['appwrite$'] = standaloneAppwriteAlias;
        }

        return config;
    },
};

export default withBundleAnalyzer(nextConfig);
