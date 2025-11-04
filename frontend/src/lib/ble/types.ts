export type UUID = string;

export type ConnectionMode = 'auto' | 'web-bluetooth' | 'proxy' | 'esphome-proxy';
export type ResolvedMode = 'direct' | 'proxy' | 'esphome-proxy' | 'none';

export interface SfpProfile {
  serviceUuid: UUID;
  writeCharUuid: UUID;
  notifyCharUuid: UUID;
  deviceAddress?: string;
  deviceName?: string;
}

export interface BleNotification {
  value: DataView;
}

export interface DeviceInfo {
  name?: string;
  address?: string;
  rssi?: number;
}

export interface GattLikeCharacteristic {
  uuid: UUID;
  writeValue: (data: ArrayBufferLike | Uint8Array) => Promise<void>;
  writeValueWithoutResponse: (data: ArrayBufferLike | Uint8Array) => Promise<void>;
  startNotifications: () => Promise<{ addEventListener?: (ev: 'characteristicvaluechanged', cb: (ev: { target: { value: DataView } }) => void) => void } | void>;
  addEventListener?: (ev: 'characteristicvaluechanged', cb: (ev: { target: { value: DataView } }) => void) => void;
}

export interface GattLikeService {
  getCharacteristic: (uuid: UUID) => Promise<GattLikeCharacteristic>;
}

export interface GattConnection {
  getPrimaryService: (uuid: UUID) => Promise<GattLikeService>;
}

export interface GattLikeServer {
  connect: () => Promise<GattConnection>;
}

export interface ProxyRequestOptions {
  services: UUID[];
  deviceAddress?: string | null;
  adapter?: string | null;
}
