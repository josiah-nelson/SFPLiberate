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
 * Supports three deployment modes (all using SSR + unified API pattern):
 * 1. standalone: Docker deployment with API proxy to FastAPI + SQLite
 * 2. homeassistant: Home Assistant add-on with ingress and API proxy
 * 3. appwrite: Appwrite Sites (SSR) with native Appwrite SDK (no backend API)
 *
 * Deployment mode is automatically detected:
 * - Appwrite Sites: Presence of APPWRITE_SITE_* or APPWRITE_* variables
 * - Home Assistant: DEPLOYMENT_MODE=homeassistant
 * - Standalone: Default (Docker deployment)
 *
 * Standalone/HA modes use REST API pattern via /api/* rewrites.
 * Appwrite mode uses native Appwrite SDK (no backend API needed).
 */
const isAppwriteSite = !!(
    process.env.APPWRITE_SITE_API_ENDPOINT ||
    process.env.APPWRITE_SITE_PROJECT_ID ||
    process.env.APPWRITE_ENDPOINT ||
    process.env.APPWRITE_PROJECT_ID
);
const deploymentMode = isAppwriteSite ? 'appwrite' : (process.env.DEPLOYMENT_MODE || 'standalone').toLowerCase();
const isStandalone = deploymentMode === 'standalone';
const isHomeAssistant = deploymentMode === 'homeassistant';
const isAppwrite = deploymentMode === 'appwrite';

// Only standalone and HA modes need the appwrite stub (no direct SDK usage)
const require = createRequire(import.meta.url);
const standaloneAppwriteAlias = require.resolve('./src/lib/appwrite-standalone');

// https://nextjs.org/docs/pages/api-reference/next-config-js
const nextConfig: NextConfig = {
    // Output mode: standalone for Docker, but NOT for Appwrite Sites
    // Appwrite Sites docs: "Ensure you don't set output in next.config.js" for SSR
    // https://appwrite.io/docs/products/sites/rendering/ssr
    ...(isAppwrite ? {} : { output: 'standalone' }),

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

    // Rewrites for standalone/HA modes only (Appwrite uses native SDK)
    // Omit entirely for Appwrite mode to avoid any URL parsing issues
    ...(isAppwrite ? {} : {
        async rewrites() {
            // Determine backend URL based on deployment mode
            const backendUrl = isHomeAssistant
                ? 'http://localhost:80'  // HA add-on
                : (process.env.BACKEND_URL || 'http://backend:80');  // Standalone

            console.log(`[Next.js Config] Deployment mode: ${deploymentMode}`);
            console.log(`[Next.js Config] Backend URL: ${backendUrl}`);

            return [
                {
                    source: '/api/:path*',
                    destination: `${backendUrl}/api/:path*`,
                },
            ];
        },
    }),

    // Security headers
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    // Force HTTPS and prevent downgrade attacks
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload'
                    },
                    // Prevent clickjacking
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY'
                    },
                    // Prevent MIME sniffing
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff'
                    },
                    // Control referrer information
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin'
                    },
                    // Restrict browser features
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
                    },
                    // Content Security Policy
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-eval
                            "style-src 'self' 'unsafe-inline'",
                            "img-src 'self' data: https:",
                            "font-src 'self' data:",
                            "connect-src 'self' https://*.appwrite.io https://nyc.cloud.appwrite.io",
                            "frame-ancestors 'none'",
                            "base-uri 'self'",
                            "form-action 'self'"
                        ].join('; ')
                    }
                ],
            },
        ];
    },

    // Redirect HTTP to HTTPS in production
    async redirects() {
        if (process.env.NODE_ENV === 'production' && !isHomeAssistant) {
            return [
                {
                    source: '/:path*',
                    has: [
                        {
                            type: 'header',
                            key: 'x-forwarded-proto',
                            value: 'http',
                        },
                    ],
                    destination: 'https://:host/:path*',
                    permanent: true,
                },
            ];
        }
        return [];
    },

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
