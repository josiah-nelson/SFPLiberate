/**
 * Feature Flags and Environment Detection
 *
 * This module provides automatic deployment mode detection:
 * 1. Standalone deployment (Docker, self-hosted) - Default, no Appwrite variables
 * 2. Appwrite cloud deployment (Public instance) - Auto-detected by presence of APPWRITE_FUNCTION_* or APPWRITE_* variables
 *
 * Deployment mode is AUTOMATICALLY DETECTED - no manual configuration needed.
 * Matches detection logic in next.config.ts for consistency.
 */

export type DeploymentMode = 'standalone' | 'appwrite';

/**
 * Get Appwrite endpoint (cloud only)
 *
 * Checks multiple sources in order of precedence:
 * 1. APPWRITE_SITE_API_ENDPOINT (auto-injected by Appwrite Sites)
 * 2. APPWRITE_ENDPOINT (custom env var)
 */
export function getAppwriteEndpoint(): string | undefined {
  return process.env.APPWRITE_SITE_API_ENDPOINT ||
         process.env.APPWRITE_ENDPOINT;
}

/**
 * Get Appwrite project ID (cloud only)
 *
 * Checks multiple sources in order of precedence:
 * 1. APPWRITE_SITE_PROJECT_ID (auto-injected by Appwrite Sites)
 * 2. APPWRITE_PROJECT_ID (custom env var)
 */
export function getAppwriteProjectId(): string | undefined {
  return process.env.APPWRITE_SITE_PROJECT_ID ||
         process.env.APPWRITE_PROJECT_ID;
}

/**
 * Get the current deployment mode
 *
 * Auto-detected based on presence of Appwrite environment variables.
 * This matches the detection logic in next.config.ts.
 */
export function getDeploymentMode(): DeploymentMode {
  // Check for Appwrite-injected or custom variables
  const hasAppwriteVars = !!(
    process.env.APPWRITE_SITE_API_ENDPOINT ||
    process.env.APPWRITE_SITE_PROJECT_ID ||
    process.env.APPWRITE_ENDPOINT ||
    process.env.APPWRITE_PROJECT_ID
  );

  if (hasAppwriteVars) {
    return 'appwrite';
  }

  // Otherwise, standalone (Docker) deployment
  return 'standalone';
}

/**
 * Check if running in standalone mode (Docker, self-hosted)
 */
export function isStandalone(): boolean {
  return getDeploymentMode() === 'standalone';
}

/**
 * Check if running in Appwrite cloud mode (public instance)
 */
export function isAppwrite(): boolean {
  return getDeploymentMode() === 'appwrite';
}

/**
 * Check if authentication is enabled
 * Auto-enabled for Appwrite deployment, disabled for standalone
 */
export function isAuthEnabled(): boolean {
  // In Appwrite mode, check the feature flag (default true)
  if (isAppwrite()) {
    return process.env.APPWRITE_ENABLE_AUTH !== 'false';
  }
  // Standalone mode never has auth
  return false;
}

/**
 * Check if Web Bluetooth is enabled
 */
export function isWebBluetoothEnabled(): boolean {
  const envVar = isAppwrite()
    ? process.env.APPWRITE_ENABLE_WEB_BLUETOOTH
    : process.env.ENABLE_WEB_BLUETOOTH;
  return envVar !== 'false'; // Default true
}

/**
 * Check if BLE Proxy mode is enabled
 */
export function isBLEProxyEnabled(): boolean {
  const envVar = isAppwrite()
    ? process.env.APPWRITE_ENABLE_BLE_PROXY
    : process.env.ENABLE_BLE_PROXY;
  return envVar !== 'false'; // Default true
}

/**
 * Check if community features are enabled
 */
export function isCommunityFeaturesEnabled(): boolean {
  const envVar = isAppwrite()
    ? process.env.APPWRITE_ENABLE_COMMUNITY_FEATURES
    : process.env.ENABLE_COMMUNITY_FEATURES;
  return envVar === 'true'; // Default false
}

/**
 * Get API base URL - for standalone/HA modes only
 *
 * Standalone/HA modes use /api/* which is rewritten in next.config.ts:
 * - Standalone: /api/* → http://backend:80/api/*
 * - Home Assistant: /api/* → http://localhost:80/api/*
 * - Appwrite: Uses native Appwrite SDK (no API rewrites)
 */
export function getApiUrl(): string {
  return '/api';
}

/**
 * Feature flag configuration object
 * Values are computed at runtime based on deployment mode
 */
export const features = {
  deployment: {
    mode: getDeploymentMode(),
    isStandalone: isStandalone(),
    isAppwrite: isAppwrite(),
  },
  auth: {
    enabled: isAuthEnabled(),
  },
  ble: {
    webBluetooth: isWebBluetoothEnabled(),
    proxy: isBLEProxyEnabled(),
  },
  community: {
    enabled: isCommunityFeaturesEnabled(),
  },
  api: {
    baseUrl: getApiUrl(),
  },
  appwrite: {
    endpoint: getAppwriteEndpoint(),
    projectId: getAppwriteProjectId(),
  },
} as const;

/**
 * Validate required environment variables for the current deployment mode
 */
export function validateEnvironment(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const mode = getDeploymentMode();

  // Validate Appwrite configuration (only if in Appwrite mode)
  if (mode === 'appwrite') {
    if (!getAppwriteEndpoint()) {
      errors.push('APPWRITE_SITE_API_ENDPOINT or APPWRITE_ENDPOINT is missing');
    }
    if (!getAppwriteProjectId()) {
      errors.push('APPWRITE_SITE_PROJECT_ID or APPWRITE_PROJECT_ID is missing');
    }
    // API URL is always /api (unified pattern), no validation needed
  }

  // Standalone mode always valid (uses defaults)

  return {
    valid: errors.length === 0,
    errors,
  };
}
