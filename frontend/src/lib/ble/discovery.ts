import { saveActiveProfile } from './profile';
import type { SfpProfile } from './types';

/**
 * Simplified Discovery API for SFP Wizard devices
 *
 * Approach:
 * 1. Use requestDevice with name filters (widely supported)
 * 2. After user selects device, enumerate all services/characteristics
 * 3. Auto-detect notify + write characteristics
 * 4. Save profile for future connections
 */

// Use 'any' for BluetoothDevice since Web Bluetooth types aren't standard
export interface DiscoveryResult {
  device: any; // BluetoothDevice
  profile: SfpProfile;
}

export interface DiscoveryError {
  code: 'user-cancelled' | 'not-supported' | 'no-device-found' | 'no-services-found' | 'connection-failed' | 'unknown';
  message: string;
  originalError?: any;
}

/**
 * Main discovery function - handles everything in one call
 * This is the primary API that components should use
 */
export async function discoverAndConnectSfpDevice(): Promise<DiscoveryResult> {
  // Step 1: Request device from user with name filter
  const device = await requestSfpDevice();

  // Step 2: Connect and enumerate services
  const profile = await enumerateDeviceProfile(device);

  // Step 3: Save profile for future use
  saveActiveProfile(profile);

  // Step 4: Disconnect (caller will reconnect using the profile)
  try {
    await device.gatt?.disconnect();
  } catch (e) {
    console.warn('Failed to disconnect after enumeration:', e);
  }

  return { device, profile };
}

/**
 * Request a device from the user with SFP name filter
 * Uses standard GATT services + known SFP device services in optionalServices
 */
async function requestSfpDevice(): Promise<any> {
  const bluetooth = (navigator as any).bluetooth;

  if (!bluetooth || typeof bluetooth.requestDevice !== 'function') {
    throw createError('not-supported', 'Web Bluetooth API is not available in this browser.');
  }

  // Standard GATT services that allow basic device info
  const standardServices = [
    '00001800-0000-1000-8000-00805f9b34fb', // Generic Access (GAP)
    '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute (GATT)
  ];

  // Known SFP Wizard service UUIDs (firmware v1.0.10)
  // These must be in optionalServices to allow Web Bluetooth to enumerate them
  const knownSfpServices = [
    '8e60f02e-f699-4865-b83f-f40501752184', // SFP Wizard primary service
    '0b9676ee-8352-440a-bf80-61541d578fcf', // SFP Wizard secondary service
  ];

  // Combine all services we want to access
  const allServices = [...standardServices, ...knownSfpServices];

  try {
    // Try with name filter first (best UX)
    const device = await bluetooth.requestDevice({
      filters: [
        { namePrefix: 'SFP' },
        { namePrefix: 'sfp' },
        { namePrefix: 'Sfp' },
      ],
      optionalServices: allServices, // Allow service enumeration
    });

    if (!device) {
      throw createError('no-device-found', 'No device was selected.');
    }

    return device;
  } catch (error: any) {
    // Handle specific error cases
    if (error.name === 'NotFoundError') {
      throw createError('user-cancelled', 'Device selection was cancelled.');
    }

    // If name filter fails, try acceptAllDevices as fallback
    try {
      console.warn('Name filter failed, trying acceptAllDevices fallback');
      const device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: allServices, // Allow service enumeration
      });

      // Check if selected device name contains 'sfp'
      const deviceName = (device.name || '').toLowerCase();
      if (!deviceName.includes('sfp')) {
        throw createError('no-device-found',
          `Selected device "${device.name || 'Unknown'}" does not appear to be an SFP Wizard. Please select a device with "SFP" in the name.`);
      }

      return device;
    } catch (fallbackError: any) {
      if (fallbackError.code) {
        throw fallbackError; // Re-throw our custom errors
      }
      if (fallbackError.name === 'NotFoundError') {
        throw createError('user-cancelled', 'Device selection was cancelled.');
      }
      throw createError('unknown', 'Failed to request device', fallbackError);
    }
  }
}

/**
 * Enumerate all services and characteristics to find notify + write pair
 * This automatically detects the correct UUIDs without prior knowledge
 */
async function enumerateDeviceProfile(device: any): Promise<SfpProfile> {
  try {
    // Connect to device
    const server = await device.gatt!.connect();

    // Get all primary services
    const services = await server.getPrimaryServices();

    if (!services || services.length === 0) {
      throw createError('no-services-found',
        'No services found on device. Make sure the device is powered on and in pairing mode.');
    }

    console.log(`Found ${services.length} services, enumerating characteristics...`);

    // Search through services to find a notify + write pair
    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();

        // Look for notify and write characteristics
        const notifyChar = characteristics.find((c: any) => c.properties.notify);
        const writeChar = characteristics.find((c: any) =>
          c.properties.writeWithoutResponse || c.properties.write
        );

        if (notifyChar && writeChar) {
          console.log('✓ Found compatible service:', {
            serviceUuid: service.uuid,
            notifyCharUuid: notifyChar.uuid,
            writeCharUuid: writeChar.uuid,
          });

          return {
            serviceUuid: service.uuid,
            notifyCharUuid: notifyChar.uuid,
            writeCharUuid: writeChar.uuid,
            deviceName: device.name,
            deviceAddress: device.id, // Use device.id as a stable identifier
          };
        }
      } catch (e) {
        console.warn(`Failed to enumerate service ${service.uuid}:`, e);
        // Continue to next service
      }
    }

    // If we get here, no compatible service was found
    throw createError('no-services-found',
      `Device has ${services.length} service(s) but none have the required notify + write characteristics. ` +
      'This may not be an SFP Wizard device, or it may be using a non-standard GATT profile.');

  } catch (error: any) {
    if (error.code) {
      throw error; // Re-throw our custom errors
    }

    // Handle connection errors
    if (error.name === 'NetworkError' || error.message?.includes('GATT')) {
      throw createError('connection-failed',
        'Failed to connect to device. Make sure the device is powered on, not connected to another app, and in range.',
        error);
    }

    throw createError('unknown', 'Failed to enumerate device profile', error);
  }
}

/**
 * Alternative: Request device with known profile (when UUIDs are already known)
 * This is useful for reconnecting to a previously discovered device
 */
export async function requestDeviceWithProfile(profile: SfpProfile): Promise<any> {
  const bluetooth = (navigator as any).bluetooth;

  if (!bluetooth || typeof bluetooth.requestDevice !== 'function') {
    throw createError('not-supported', 'Web Bluetooth API is not available in this browser.');
  }

  // Standard GATT services plus the discovered service
  const standardServices = [
    '00001800-0000-1000-8000-00805f9b34fb', // Generic Access (GAP)
    '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute (GATT)
  ];

  try {
    // Request with known service UUID
    const device = await bluetooth.requestDevice({
      filters: [{ services: [profile.serviceUuid] }],
      optionalServices: [...standardServices, profile.serviceUuid],
    });

    return device;
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      throw createError('user-cancelled', 'Device selection was cancelled.');
    }

    // Fallback to name-based selection
    try {
      console.warn('Service filter failed, trying name filter');
      return await requestSfpDevice();
    } catch (fallbackError: any) {
      throw fallbackError.code ? fallbackError : createError('unknown', 'Failed to request device', error);
    }
  }
}

/**
 * Helper to create consistent error objects
 */
function createError(code: DiscoveryError['code'], message: string, originalError?: any): DiscoveryError {
  const error = new Error(message) as any;
  error.code = code;
  error.originalError = originalError;
  return error as DiscoveryError;
}

/**
 * Check if Web Bluetooth scanning is supported (optional feature)
 * Note: This is NOT required for basic discovery - kept for compatibility
 */
export function canScan(): boolean {
  try {
    return !!(navigator && (navigator as any).bluetooth && typeof (navigator as any).bluetooth.requestLEScan === 'function');
  } catch {
    return false;
  }
}
