/**
 * Home Assistant Bluetooth API client for frontend.
 *
 * This client is used when running as a Home Assistant add-on.
 * It communicates with the backend's HA Bluetooth endpoints.
 */

import type {
  HABluetoothDevice,
  HADeviceConnectionRequest,
  HADeviceConnectionResponse,
  HABluetoothStatus,
} from '@/types/ha-bluetooth';

const API_BASE = '/api/v1/ha-bluetooth';

export class HABluetoothClient {
  /**
   * Get current status of HA Bluetooth integration.
   */
  async getStatus(): Promise<HABluetoothStatus> {
    const response = await fetch(`${API_BASE}/status`);

    if (!response.ok) {
      throw new Error(`Failed to get status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get list of auto-discovered Bluetooth devices.
   *
   * Devices are filtered by backend based on configured patterns.
   */
  async getDevices(): Promise<HABluetoothDevice[]> {
    const response = await fetch(`${API_BASE}/devices`);

    if (!response.ok) {
      throw new Error(`Failed to get devices: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Connect to a device and retrieve GATT UUIDs.
   *
   * @param macAddress - Device MAC address
   * @returns Connection response with service/characteristic UUIDs
   */
  async connect(macAddress: string): Promise<HADeviceConnectionResponse> {
    const request: HADeviceConnectionRequest = {
      mac_address: macAddress,
    };

    const response = await fetch(`${API_BASE}/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Connection failed');
    }

    return response.json();
  }
}

/**
 * Check if running in Home Assistant add-on mode.
 *
 * This is detected by checking for the HA-specific API endpoint.
 */
export async function isHAAddonMode(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/status`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Singleton instance.
 */
export const haBluetoothClient = new HABluetoothClient();
