/**
 * Type definitions for Home Assistant Bluetooth integration.
 */

export interface HABluetoothDevice {
  mac: string;
  name: string;
  rssi: number;
  source: string;
  last_seen?: string;
}

export interface HADeviceConnectionRequest {
  mac_address: string;
}

export interface HADeviceConnectionResponse {
  service_uuid: string;
  notify_char_uuid: string;
  write_char_uuid: string;
  device_name?: string;
  source?: string;
}

export interface HABluetoothStatus {
  enabled: boolean;
  devices_discovered: number;
  ha_api_url: string;
  connected: boolean;
}

export interface SignalStrength {
  level: 'excellent' | 'good' | 'fair' | 'poor';
  percentage: number;
  bars: number;
}

/**
 * Calculate signal strength level from RSSI.
 *
 * RSSI ranges (dBm):
 * -50 and above: Excellent (100%)
 * -60 to -51: Good (75%)
 * -70 to -61: Fair (50%)
 * -70 to -61: Fair (50%)
 * Below -70: Poor (25%)
 */
export function getSignalStrength(rssi: number): SignalStrength {
  let level: SignalStrength['level'];
  let percentage: number;
  let bars: number;

  if (rssi >= -50) {
    level = 'excellent';
    percentage = 100;
    bars = 4;
  } else if (rssi >= -60) {
    level = 'good';
    percentage = 75;
    bars = 3;
  } else if (rssi >= -70) {
    level = 'fair';
    percentage = 50;
    bars = 2;
  } else {
    level = 'poor';
    percentage = 25;
    bars = 1;
  }

  return { level, percentage, bars };
}
