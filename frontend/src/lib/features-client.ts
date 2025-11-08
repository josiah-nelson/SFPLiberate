/**
 * Client-Safe Feature Flags
 * 
 * This module provides feature detection that is safe to use in client components.
 * Uses NEXT_PUBLIC env vars that are injected at build time.
 */

export type DeploymentMode = 'standalone' | 'appwrite';

/**
 * Get deployment mode (client-safe)
 * Reads from NEXT_PUBLIC_DEPLOYMENT_MODE set in next.config.ts
 */
export function getDeploymentMode(): DeploymentMode {
  const mode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || 'standalone';
  return mode as DeploymentMode;
}

/**
 * Check if running in standalone mode
 */
export function isStandalone(): boolean {
  return getDeploymentMode() === 'standalone';
}

/**
 * Check if running in Appwrite mode
 */
export function isAppwrite(): boolean {
  return getDeploymentMode() === 'appwrite';
}

/**
 * Check if authentication is enabled (client-safe)
 * In Appwrite mode, auth is always enabled
 * In standalone mode, auth is disabled
 */
export function isAuthEnabled(): boolean {
  return isAppwrite();
}

/**
 * Check if Web Bluetooth is enabled (client-safe)
 */
export function isWebBluetoothEnabled(): boolean {
  // Default true, can be disabled via env var
  if (typeof process !== 'undefined') {
    const envVar = isAppwrite()
      ? process.env.NEXT_PUBLIC_ENABLE_WEB_BLUETOOTH
      : process.env.NEXT_PUBLIC_ENABLE_WEB_BLUETOOTH;
    return envVar !== 'false';
  }
  return true;
}

/**
 * Check if BLE Proxy mode is enabled (client-safe)
 */
export function isBLEProxyEnabled(): boolean {
  // Default true, can be disabled via env var
  if (typeof process !== 'undefined') {
    const envVar = isAppwrite()
      ? process.env.NEXT_PUBLIC_ENABLE_BLE_PROXY
      : process.env.NEXT_PUBLIC_ENABLE_BLE_PROXY;
    return envVar !== 'false';
  }
  return true;
}

/**
 * Check if community features are enabled (client-safe)
 */
export function isCommunityFeaturesEnabled(): boolean {
  // Default false, must be explicitly enabled
  if (typeof process !== 'undefined') {
    const envVar = isAppwrite()
      ? process.env.NEXT_PUBLIC_ENABLE_COMMUNITY_FEATURES
      : process.env.NEXT_PUBLIC_ENABLE_COMMUNITY_FEATURES;
    return envVar === 'true';
  }
  return false;
}

/**
 * Get API base URL (client-safe)
 * Always /api (unified pattern across all modes)
 */
export function getApiUrl(): string {
  return '/api';
}
