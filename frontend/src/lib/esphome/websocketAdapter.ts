/**
 * Adapter to make ESPHome WebSocket client look like Web Bluetooth GATT API.
 *
 * This allows seamless integration with existing BLE manager code.
 */

import type {
  GattLikeCharacteristic,
  GattLikeService,
  GattConnection,
  UUID,
} from '@/lib/ble/types';
import {
  ESPHomeWebSocketClient,
  type NotificationCallback,
} from './esphomeWebSocketClient';

export class ESPHomeCharacteristic implements GattLikeCharacteristic {
  private notificationListeners: Array<(ev: { target: { value: DataView } }) => void> = [];

  private toArrayBuffer(data: ArrayBufferLike | Uint8Array): ArrayBuffer {
    if (data instanceof Uint8Array) {
      if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength && data.buffer instanceof ArrayBuffer) {
        return data.buffer;
      }
      return data.slice().buffer;
    }

    if (data instanceof ArrayBuffer) {
      return data;
    }

    return new Uint8Array(data).slice().buffer;
  }

  constructor(
    public uuid: UUID,
    private client: ESPHomeWebSocketClient,
    private isNotifyChar: boolean,
    private isWriteChar: boolean
  ) {}

  async writeValue(data: ArrayBufferLike | Uint8Array): Promise<void> {
    if (!this.isWriteChar) {
      throw new Error(`Characteristic ${this.uuid} is not writable`);
    }

    const buffer = this.toArrayBuffer(data);
    await this.client.writeCharacteristic(this.uuid, buffer, true);
  }

  async writeValueWithoutResponse(data: ArrayBufferLike | Uint8Array): Promise<void> {
    if (!this.isWriteChar) {
      throw new Error(`Characteristic ${this.uuid} is not writable`);
    }

    const buffer = this.toArrayBuffer(data);
    await this.client.writeCharacteristic(this.uuid, buffer, false);
  }

  async startNotifications(): Promise<void> {
    if (!this.isNotifyChar) {
      throw new Error(`Characteristic ${this.uuid} does not support notifications`);
    }

    // Subscribe to notifications and forward to event listeners
    const callback: NotificationCallback = (data: ArrayBuffer) => {
      const dataView = new DataView(data);
      const event = {
        target: { value: dataView },
      };

      // Call all registered listeners
      this.notificationListeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error('[ESPHome Adapter] Error in notification listener:', error);
        }
      });
    };

    await this.client.subscribeToNotifications(this.uuid, callback);
  }

  addEventListener(
    event: 'characteristicvaluechanged',
    callback: (ev: { target: { value: DataView } }) => void
  ): void {
    if (event === 'characteristicvaluechanged') {
      this.notificationListeners.push(callback);
    }
  }
}

export class ESPHomeService implements GattLikeService {
  constructor(
    private uuid: UUID,
    private client: ESPHomeWebSocketClient,
    private notifyCharUUID: UUID,
    private writeCharUUID: UUID
  ) {}

  async getCharacteristic(uuid: UUID): Promise<GattLikeCharacteristic> {
    const normalizedUUID = uuid.toLowerCase();
    const isNotifyChar = normalizedUUID === this.notifyCharUUID.toLowerCase();
    const isWriteChar = normalizedUUID === this.writeCharUUID.toLowerCase();

    if (!isNotifyChar && !isWriteChar) {
      throw new Error(`Characteristic ${uuid} not found in service`);
    }

    return new ESPHomeCharacteristic(uuid, this.client, isNotifyChar, isWriteChar);
  }
}

export class ESPHomeGattConnection implements GattConnection {
  constructor(
    private client: ESPHomeWebSocketClient,
    private serviceUUID: UUID,
    private notifyCharUUID: UUID,
    private writeCharUUID: UUID
  ) {}

  async getPrimaryService(uuid: UUID): Promise<GattLikeService> {
    if (uuid.toLowerCase() !== this.serviceUUID.toLowerCase()) {
      throw new Error(`Service ${uuid} not found`);
    }

    return new ESPHomeService(
      uuid,
      this.client,
      this.notifyCharUUID,
      this.writeCharUUID
    );
  }
}

export class ESPHomeGattServer {
  constructor(
    private client: ESPHomeWebSocketClient,
    private serviceUUID: UUID,
    private notifyCharUUID: UUID,
    private writeCharUUID: UUID
  ) {}

  async connect(): Promise<GattConnection> {
    // Already connected during requestDevice
    return new ESPHomeGattConnection(
      this.client,
      this.serviceUUID,
      this.notifyCharUUID,
      this.writeCharUUID
    );
  }
}

export class ESPHomeDevice {
  public gatt: ESPHomeGattServer;
  public name: string | undefined;
  public id: string;

  constructor(
    private client: ESPHomeWebSocketClient,
    macAddress: string,
    deviceName: string | undefined,
    serviceUUID: UUID,
    notifyCharUUID: UUID,
    writeCharUUID: UUID
  ) {
    this.id = macAddress;
    this.name = deviceName;
    this.gatt = new ESPHomeGattServer(client, serviceUUID, notifyCharUUID, writeCharUUID);
  }
}

/**
 * ESPHome WebSocket client adapter that mimics Web Bluetooth API.
 *
 * Usage:
 *   const adapter = new ESPHomeAdapter();
 *   await adapter.connect();
 *   const device = await adapter.requestDevice({ macAddress, ... });
 */
export class ESPHomeAdapter {
  private client: ESPHomeWebSocketClient | null = null;

  constructor(private wsUrl: string) {}

  async connect(): Promise<void> {
    this.client = new ESPHomeWebSocketClient(this.wsUrl);
    await this.client.connect();
  }

  async requestDevice(options: {
    macAddress: string;
    serviceUUID?: UUID;
    notifyCharUUID?: UUID;
    writeCharUUID?: UUID;
  }): Promise<ESPHomeDevice> {
    if (!this.client) {
      throw new Error('Adapter not connected - call connect() first');
    }

    // Connect to device via WebSocket
    await this.client.connectDevice(
      options.macAddress,
      options.serviceUUID,
      options.notifyCharUUID,
      options.writeCharUUID
    );

    // Get device info from client
    const info = this.client.getDeviceInfo();
    if (!info.serviceUUID || !info.notifyCharUUID || !info.writeCharUUID) {
      throw new Error('Failed to retrieve device UUIDs');
    }

    return new ESPHomeDevice(
      this.client,
      options.macAddress,
      info.name || undefined,
      info.serviceUUID,
      info.notifyCharUUID,
      info.writeCharUUID
    );
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnectDevice();
      this.client.close();
      this.client = null;
    }
  }

  getClient(): ESPHomeWebSocketClient | null {
    return this.client;
  }
}
