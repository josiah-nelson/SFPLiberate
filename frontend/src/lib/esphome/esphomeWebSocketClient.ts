/**
 * ESPHome WebSocket client for BLE proxy communication.
 *
 * Provides Web Bluetooth-like API for Safari/iOS using ESPHome proxy backend.
 */

export enum BLEMessageType {
  // Client → Server
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  WRITE = 'write',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',

  // Server → Client
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  NOTIFICATION = 'notification',
  STATUS = 'status',
  ERROR = 'error',
}

export interface BLEConnectMessage {
  type: BLEMessageType.CONNECT;
  mac_address: string;
  service_uuid?: string;
  notify_char_uuid?: string;
  write_char_uuid?: string;
}

export interface BLEDisconnectMessage {
  type: BLEMessageType.DISCONNECT;
}

export interface BLEWriteMessage {
  type: BLEMessageType.WRITE;
  characteristic_uuid: string;
  data: string; // base64
  with_response?: boolean;
}

export interface BLESubscribeMessage {
  type: BLEMessageType.SUBSCRIBE;
  characteristic_uuid: string;
}

export interface BLEConnectedMessage {
  type: BLEMessageType.CONNECTED;
  device_name?: string;
  device_address: string;
  service_uuid: string;
  notify_char_uuid: string;
  write_char_uuid: string;
  proxy_used: string;
}

export interface BLENotificationMessage {
  type: BLEMessageType.NOTIFICATION;
  characteristic_uuid: string;
  data: string; // base64
}

export interface BLEStatusMessage {
  type: BLEMessageType.STATUS;
  connected: boolean;
  device_name?: string;
  message: string;
}

export interface BLEErrorMessage {
  type: BLEMessageType.ERROR;
  error: string;
  details?: any;
}

type ServerMessage =
  | BLEConnectedMessage
  | BLENotificationMessage
  | BLEStatusMessage
  | BLEErrorMessage;

export type NotificationCallback = (data: ArrayBuffer) => void;

export class ESPHomeWebSocketClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private deviceConnected = false;
  private notificationCallbacks = new Map<string, NotificationCallback>();
  private pendingResolvers = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason: any) => void }
  >();

  // Device info
  private deviceAddress: string | null = null;
  private deviceName: string | null = null;
  private serviceUUID: string | null = null;
  private notifyCharUUID: string | null = null;
  private writeCharUUID: string | null = null;

  constructor(private wsUrl: string) {}

  /**
   * Connect to WebSocket server.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[ESPHome WS] Connected to WebSocket');
        this.connected = true;
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('[ESPHome WS] WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        console.log('[ESPHome WS] WebSocket closed');
        this.connected = false;
        this.deviceConnected = false;
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Connect to BLE device.
   */
  async connectDevice(
    macAddress: string,
    serviceUUID?: string,
    notifyCharUUID?: string,
    writeCharUUID?: string
  ): Promise<void> {
    if (!this.connected) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const message: BLEConnectMessage = {
        type: BLEMessageType.CONNECT,
        mac_address: macAddress,
        service_uuid: serviceUUID,
        notify_char_uuid: notifyCharUUID,
        write_char_uuid: writeCharUUID,
      };

      // Store resolver for when we get CONNECTED response
      this.pendingResolvers.set('connect', { resolve, reject });

      this.send(message);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingResolvers.has('connect')) {
          this.pendingResolvers.delete('connect');
          reject(new Error('Connection timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Disconnect from BLE device.
   */
  async disconnectDevice(): Promise<void> {
    if (!this.deviceConnected) {
      return;
    }

    const message: BLEDisconnectMessage = {
      type: BLEMessageType.DISCONNECT,
    };

    this.send(message);
    this.deviceConnected = false;
    this.deviceAddress = null;
    this.deviceName = null;
    this.notificationCallbacks.clear();
  }

  /**
   * Write data to characteristic.
   */
  async writeCharacteristic(
    characteristicUUID: string,
    data: ArrayBuffer,
    withResponse = true
  ): Promise<void> {
    if (!this.deviceConnected) {
      throw new Error('No device connected');
    }

    // Convert ArrayBuffer to base64
    const base64 = this.arrayBufferToBase64(data);

    const message: BLEWriteMessage = {
      type: BLEMessageType.WRITE,
      characteristic_uuid: characteristicUUID,
      data: base64,
      with_response: withResponse,
    };

    this.send(message);
  }

  /**
   * Subscribe to notifications from a characteristic.
   */
  async subscribeToNotifications(
    characteristicUUID: string,
    callback: NotificationCallback
  ): Promise<void> {
    if (!this.deviceConnected) {
      throw new Error('No device connected');
    }

    this.notificationCallbacks.set(characteristicUUID, callback);

    // Note: Subscription is automatic on connect for ESPHome proxy
    // This just registers the callback
  }

  /**
   * Unsubscribe from notifications.
   */
  async unsubscribeFromNotifications(characteristicUUID: string): Promise<void> {
    this.notificationCallbacks.delete(characteristicUUID);
  }

  /**
   * Get device info.
   */
  getDeviceInfo() {
    return {
      address: this.deviceAddress,
      name: this.deviceName,
      serviceUUID: this.serviceUUID,
      notifyCharUUID: this.notifyCharUUID,
      writeCharUUID: this.writeCharUUID,
    };
  }

  /**
   * Check if device is connected.
   */
  isDeviceConnected(): boolean {
    return this.deviceConnected;
  }

  /**
   * Close WebSocket connection.
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.deviceConnected = false;
    this.deviceAddress = null;
    this.deviceName = null;
    this.notificationCallbacks.clear();
    this.pendingResolvers.clear();
  }

  // Private methods

  private send(message: any): void {
    if (!this.ws || !this.connected) {
      throw new Error('WebSocket not connected');
    }

    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(data: string): void {
    try {
      const message: ServerMessage = JSON.parse(data);

      switch (message.type) {
        case BLEMessageType.CONNECTED:
          this.handleConnected(message as BLEConnectedMessage);
          break;

        case BLEMessageType.NOTIFICATION:
          this.handleNotification(message as BLENotificationMessage);
          break;

        case BLEMessageType.STATUS:
          this.handleStatus(message as BLEStatusMessage);
          break;

        case BLEMessageType.ERROR:
          this.handleError(message as BLEErrorMessage);
          break;

        default:
          console.warn('[ESPHome WS] Unknown message type:', message);
      }
    } catch (error) {
      console.error('[ESPHome WS] Error parsing message:', error);
    }
  }

  private handleConnected(message: BLEConnectedMessage): void {
    console.log('[ESPHome WS] Device connected:', message);

    this.deviceConnected = true;
    this.deviceAddress = message.device_address;
    this.deviceName = message.device_name || null;
    this.serviceUUID = message.service_uuid;
    this.notifyCharUUID = message.notify_char_uuid;
    this.writeCharUUID = message.write_char_uuid;

    // Resolve pending connect promise
    const resolver = this.pendingResolvers.get('connect');
    if (resolver) {
      resolver.resolve(message);
      this.pendingResolvers.delete('connect');
    }
  }

  private handleNotification(message: BLENotificationMessage): void {
    // Decode base64 to ArrayBuffer
    const arrayBuffer = this.base64ToArrayBuffer(message.data);

    // Call registered callback
    const callback = this.notificationCallbacks.get(message.characteristic_uuid);
    if (callback) {
      callback(arrayBuffer);
    } else {
      console.warn(
        '[ESPHome WS] No callback registered for characteristic:',
        message.characteristic_uuid
      );
    }
  }

  private handleStatus(message: BLEStatusMessage): void {
    console.log('[ESPHome WS] Status:', message.message);
  }

  private handleError(message: BLEErrorMessage): void {
    console.error('[ESPHome WS] Error:', message.error, message.details);

    // Reject pending promises
    const resolver = this.pendingResolvers.get('connect');
    if (resolver) {
      resolver.reject(new Error(message.error));
      this.pendingResolvers.delete('connect');
    }
  }

  // Utility methods

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

/**
 * Create ESPHome WebSocket client instance.
 */
export function createESPHomeWebSocketClient(): ESPHomeWebSocketClient {
  // Determine WebSocket URL based on current location
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
  const wsUrl = `${protocol}//${host}/api/v1/esphome/ws`;

  return new ESPHomeWebSocketClient(wsUrl);
}
