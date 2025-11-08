/**
 * Module Repository Types
 *
 * Shared type definitions for module repository implementations.
 * Used by both StandaloneRepository (REST API) and AppwriteRepository (Appwrite SDK).
 */

/**
 * Module metadata (without binary EEPROM data)
 */
export interface Module {
  /** Unique identifier (integer for standalone, UUID for Appwrite) */
  id: string;

  /** User-defined module name */
  name: string;

  /** Vendor name (extracted from EEPROM) */
  vendor?: string;

  /** Model/part number (extracted from EEPROM) */
  model?: string;

  /** Serial number (extracted from EEPROM) */
  serial?: string;

  /** SHA-256 hash of EEPROM data (for duplicate detection) */
  sha256?: string;

  /** EEPROM data size in bytes */
  size?: number;

  /** Creation timestamp */
  created_at: string;
}

/**
 * Data required to create a new module
 */
export interface CreateModuleData {
  /** User-defined module name */
  name: string;

  /** Raw EEPROM binary data */
  eepromData: ArrayBuffer;

  /** Pre-parsed vendor (optional, will be extracted if not provided) */
  vendor?: string;

  /** Pre-parsed model (optional, will be extracted if not provided) */
  model?: string;

  /** Pre-parsed serial (optional, will be extracted if not provided) */
  serial?: string;

  /** Pre-calculated SHA-256 hash (optional, will be calculated if not provided) */
  sha256?: string;
}

/**
 * Result of module creation
 */
export interface CreateModuleResult {
  /** Created module metadata */
  module: Module;

  /** Whether this is a duplicate (same SHA-256 as existing module) */
  isDuplicate: boolean;

  /** Message describing the result */
  message: string;
}

/**
 * Module repository interface
 *
 * Abstraction layer for module CRUD operations.
 * Implementations:
 * - StandaloneRepository: Uses FastAPI REST API
 * - AppwriteRepository: Uses Appwrite Database + Storage
 */
export interface ModuleRepository {
  /**
   * List all modules for current user
   *
   * @returns Array of module metadata (without EEPROM data)
   */
  listModules(): Promise<Module[]>;

  /**
   * Create a new module
   *
   * @param data - Module creation data
   * @returns Result with module metadata and duplicate status
   * @throws Error if creation fails
   */
  createModule(data: CreateModuleData): Promise<CreateModuleResult>;

  /**
   * Get module metadata by ID
   *
   * @param id - Module ID
   * @returns Module metadata
   * @throws Error if module not found
   */
  getModule(id: string): Promise<Module>;

  /**
   * Get raw EEPROM binary data for a module
   *
   * @param id - Module ID
   * @returns EEPROM data as ArrayBuffer
   * @throws Error if module not found
   */
  getEEPROMData(id: string): Promise<ArrayBuffer>;

  /**
   * Delete a module
   *
   * @param id - Module ID
   * @throws Error if module not found or deletion fails
   */
  deleteModule(id: string): Promise<void>;
}
