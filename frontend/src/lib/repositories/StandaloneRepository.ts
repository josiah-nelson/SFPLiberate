/**
 * Standalone Repository Implementation
 *
 * Uses FastAPI backend REST API for module storage.
 * This is the existing implementation for Docker/self-hosted deployments.
 */

import { features } from '../features';
import type {
  Module,
  CreateModuleData,
  CreateModuleResult,
  ModuleRepository,
} from './types';

/**
 * Convert Uint8Array to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Standalone repository using FastAPI REST API
 */
export class StandaloneRepository implements ModuleRepository {
  private baseUrl: string;

  constructor() {
    // Use feature flag for API base URL
    this.baseUrl = features.api.baseUrl;
  }

  /**
   * List all modules
   */
  async listModules(): Promise<Module[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/modules`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Convert backend format to Module type
      return data.map((item: any) => ({
        id: String(item.id),
        name: item.name,
        vendor: item.vendor || undefined,
        model: item.model || undefined,
        serial: item.serial || undefined,
        sha256: item.sha256 || undefined,
        size: item.size || undefined,
        created_at: item.created_at,
      }));
    } catch (error) {
      console.error('Failed to list modules:', error);
      throw new Error(`Failed to fetch modules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new module
   */
  async createModule(data: CreateModuleData): Promise<CreateModuleResult> {
    try {
      // Convert ArrayBuffer to base64
      const eepromBase64 = arrayBufferToBase64(data.eepromData);

      const response = await fetch(`${this.baseUrl}/v1/modules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          eeprom_data_base64: eepromBase64,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // Backend returns: { status: "success"|"duplicate", message: "...", id: number }
      const isDuplicate = result.status === 'duplicate';

      // Fetch full module data to return complete Module object
      const savedModule = await this.getModule(String(result.id));

      return {
        module: savedModule,
        isDuplicate,
        message: result.message || 'Module saved successfully',
      };
    } catch (error) {
      console.error('Failed to create module:', error);
      throw new Error(`Failed to save module: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get module by ID
   */
  async getModule(id: string): Promise<Module> {
    try {
      // Backend doesn't have a GET /modules/{id} endpoint, so we fetch all and filter
      // This is acceptable for standalone mode (typically < 100 modules)
      const modules = await this.listModules();
      const foundModule = modules.find((m) => m.id === id);

      if (!foundModule) {
        throw new Error(`Module with ID ${id} not found`);
      }

      return foundModule;
    } catch (error) {
      console.error(`Failed to get module ${id}:`, error);
      throw new Error(`Failed to fetch module: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get EEPROM binary data
   */
  async getEEPROMData(id: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/modules/${id}/eeprom`, {
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Module with ID ${id} not found`);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Backend returns application/octet-stream
      const arrayBuffer = await response.arrayBuffer();
      return arrayBuffer;
    } catch (error) {
      console.error(`Failed to get EEPROM data for module ${id}:`, error);
      throw new Error(`Failed to fetch EEPROM data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a module
   */
  async deleteModule(id: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/modules/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Module with ID ${id} not found`);
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Success - backend returns { status: "success", message: "..." }
    } catch (error) {
      console.error(`Failed to delete module ${id}:`, error);
      throw new Error(`Failed to delete module: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
