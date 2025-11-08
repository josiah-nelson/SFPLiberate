/**
 * Module Repository Factory
 *
 * Provides the correct repository implementation based on deployment mode.
 * - Standalone mode: StandaloneRepository (FastAPI REST API)
 * - Appwrite mode: AppwriteRepository (Appwrite SDK)
 */

import { isAppwrite } from '../features';
import { StandaloneRepository } from './StandaloneRepository';
import { AppwriteRepository } from './AppwriteRepository';
import type { ModuleRepository } from './types';

// Singleton instances
let standaloneRepository: StandaloneRepository | null = null;
let appwriteRepository: AppwriteRepository | null = null;

/**
 * Get the appropriate module repository for the current deployment mode
 *
 * This function automatically selects the correct repository implementation:
 * - Appwrite deployment: Uses Appwrite Database + Storage
 * - Standalone deployment: Uses FastAPI REST API
 *
 * Repositories are singletons - only one instance created per deployment mode.
 *
 * @returns ModuleRepository implementation for current mode
 */
export function getModuleRepository(): ModuleRepository {
  if (isAppwrite()) {
    // Appwrite deployment mode
    if (!appwriteRepository) {
      appwriteRepository = new AppwriteRepository();
    }
    return appwriteRepository;
  } else {
    // Standalone deployment mode
    if (!standaloneRepository) {
      standaloneRepository = new StandaloneRepository();
    }
    return standaloneRepository;
  }
}

// Re-export types for convenience
export type { Module, CreateModuleData, CreateModuleResult, ModuleRepository } from './types';
