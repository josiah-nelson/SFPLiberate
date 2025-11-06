import { createRequire } from 'node:module';

import type { NextConfig } from 'next';

import initializeBundleAnalyzer from '@next/bundle-analyzer';

// https://www.npmjs.com/package/@next/bundle-analyzer
const withBundleAnalyzer = initializeBundleAnalyzer({
    enabled: process.env.BUNDLE_ANALYZER_ENABLED === 'true'
});

/**
 * Multi-Mode Deployment Configuration
 *
 * Supports three deployment modes:
 * 1. standalone: Docker deployment with API proxy (default)
 * 2. homeassistant: Home Assistant add-on with ingress support
 * 3. appwrite: Static export for Appwrite cloud hosting
 */
const deploymentMode = (process.env.DEPLOYMENT_MODE || process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || 'standalone').toLowerCase();
const isStandalone = deploymentMode === 'standalone';
const isHomeAssistant = deploymentMode === 'homeassistant';
const isAppwrite = deploymentMode === 'appwrite';

const require = createRequire(import.meta.url);
const standaloneAppwriteAlias = require.resolve('./src/lib/appwrite-standalone');

// https://nextjs.org/docs/pages/api-reference/next-config-js
const nextConfig: NextConfig = {
    // Output mode: standalone for Docker/HA, export for Appwrite
    output: (isStandalone || isHomeAssistant) ? 'standalone' : isAppwrite ? 'export' : undefined,

    env: {
        NEXT_PUBLIC_DEPLOYMENT_MODE: deploymentMode,
    },

    // Base path for Home Assistant ingress (auto-detected at runtime)
    basePath: process.env.INGRESS_PATH || '',

    // Asset prefix for ingress routing
    assetPrefix: process.env.INGRESS_PATH || '',

    modularizeImports: {
        '@radix-ui/react-icons': {
            transform: '@radix-ui/react-icons/{{member}}',
        },
    },

    // Rewrites for standalone and HA modes (proxy /api to backend)
    ...((isStandalone || isHomeAssistant) && {
        async rewrites() {
            // HA add-on uses localhost, standalone uses docker DNS
            const backendUrl = isHomeAssistant
                ? 'http://localhost:80'
                : (process.env.BACKEND_URL || 'http://backend:80');
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
        // Next.js 16: Enable Turbopack filesystem caching for faster dev builds
        turbopackFileSystemCacheForDev: true,
    },

    turbopack: (isStandalone || isHomeAssistant)
        ? {
              resolveAlias: {
                  appwrite$: standaloneAppwriteAlias,
              },
          }
        : undefined,

    webpack: (config) => {
        if (isStandalone || isHomeAssistant) {
            config.resolve = config.resolve || {};
            config.resolve.alias = config.resolve.alias || {};
            config.resolve.alias['appwrite$'] = standaloneAppwriteAlias;
        }

        return config;
    },
};

export default withBundleAnalyzer(nextConfig);
