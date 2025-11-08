import type { GattConnection, GattLikeCharacteristic, ProxyRequestOptions, UUID } from './types';

// Minimal base64 helpers
const b64decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const b64encode = (data: Uint8Array) => btoa(String.fromCharCode(...Array.from(data)));

export class BLEProxyClient {
  wsUrl: string;
  ws: WebSocket | null = null;
  connected = false;
  device: { name?: string; address?: string; services?: any[] } | null = null;
  private handlers = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private notificationCallbacks = new Map<string, (uuid: string, data: Uint8Array) => void>();
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private reconnectDelay = 1000;
  private shouldReconnect = true;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(wsUrl: string) {
    this.wsUrl = wsUrl;
  }

  static isAvailable() {
    return typeof window !== 'undefined' && 'WebSocket' in window;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        console.log('[BLEProxyClient] Connected to WebSocket');
        resolve();
      };

      this.ws.onerror = (err) => {
        if (this.reconnectAttempts === 0) {
          reject(new Error('WebSocket connection failed'));
        }
      };

      this.ws.onclose = (event) => {
        this.connected = false;
        this.device = null;
        console.log('[BLEProxyClient] WebSocket closed:', event.code, event.reason);

        // Attempt reconnection if enabled
        if (this.shouldReconnect && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts++;
          console.log(
            `[BLEProxyClient] Reconnecting (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`
          );

          this.reconnectTimeoutId = setTimeout(() => {
            this.connect().catch((err) => {
              console.error('[BLEProxyClient] Reconnection failed:', err);
            });
          }, this.reconnectDelay);

          this.reconnectDelay *= 2; // Exponential backoff
        } else if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
          console.error('[BLEProxyClient] Max reconnection attempts reached');
          this.rejectAllHandlers(new Error('WebSocket connection lost'));
        }
      };

      this.ws.onmessage = (evt) => {
        try {
          const message = JSON.parse(evt.data as string);
          this.handleMessage(message);
        } catch (e) {
          console.error('[BLEProxyClient] Message parsing error:', e);
          // Don't crash on bad messages, just log
        }
      };
    });
  }

  /**
   * Disconnect and prevent automatic reconnection
   */
  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.device = null;
  }

  /**
   * Reject all pending operation handlers
   */
  private rejectAllHandlers(error: Error) {
    this.handlers.forEach((handler) => handler.reject(error));
    this.handlers.clear();
  }

  private handleMessage(message: any) {
    const { type } = message || {};
    switch (type) {
      case 'connected': {
        this.device = {
          name: message.device_name,
          address: message.device_address,
          services: message.services,
        };
        this.resolve('connect', message);
        break;
      }
      case 'disconnected': {
        this.device = null;
        this.resolve('disconnect', message);
        break;
      }
      case 'notification': {
        const cb = this.notificationCallbacks.get(message.characteristic_uuid as string);
        if (cb) {
          const data = b64decode(message.data as string);
          cb(message.characteristic_uuid as string, data);
        }
        break;
      }
      case 'error': {
        this.reject('error', new Error(message.error || 'proxy error'));
        break;
      }
      case 'discovered': {
        this.resolve('discover', message.devices);
        break;
      }
      case 'status': {
        this.resolve('status', message);
        break;
      }
      default:
        break;
    }
  }

  private sendAndWait(key: string, payload: any) {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.connected) return reject(new Error('Not connected to proxy server'));
      this.handlers.set(key, { resolve, reject });
      this.ws!.send(JSON.stringify(payload));
    });
  }

  private resolve(key: string, value: any) {
    const h = this.handlers.get(key);
    if (h) {
      h.resolve(value);
      this.handlers.delete(key);
    }
  }
  private reject(key: string, error: any) {
    const h = this.handlers.get(key);
    if (h) {
      h.reject(error);
      this.handlers.delete(key);
    }
  }

  async discoverDevices(params: { serviceUuid?: UUID | null; timeout?: number; adapter?: string | null }) {
    return this.sendAndWait('discover', { type: 'discover', ...params }).then((r) => r as any[]);
  }

  async requestDevice(options: ProxyRequestOptions) {
    const serviceUuid = options.services?.[0];
    if (!serviceUuid) throw new Error('At least one service UUID required');
    await this.sendAndWait('connect', {
      type: 'connect',
      service_uuid: serviceUuid,
      device_address: options.deviceAddress || null,
      adapter: options.adapter || null,
    });

    // Return a GATT-like shape expected by higher-level logic
    return {
      name: this.device?.name,
      gatt: {
        connect: async (): Promise<GattConnection> => ({
          getPrimaryService: async (_uuid: UUID) => ({
            getCharacteristic: async (charUuid: UUID): Promise<GattLikeCharacteristic> => ({
              uuid: charUuid,
              writeValue: async (data: ArrayBufferLike | Uint8Array) => {
                const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
                await this.writeCharacteristic(charUuid, bytes, true);
              },
              writeValueWithoutResponse: async (data: ArrayBufferLike | Uint8Array) => {
                const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
                await this.writeCharacteristic(charUuid, bytes, false);
              },
              startNotifications: async () => {
                await this.subscribe(charUuid);
                return {
                  addEventListener: (_ev: 'characteristicvaluechanged', cb: (ev: { target: { value: DataView } }) => void) => {
                    this.notificationCallbacks.set(charUuid, (_uuid, data) => {
                      const buffer = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
                        ? data.buffer
                        : data.slice().buffer;
                      cb({ target: { value: new DataView(buffer) } });
                    });
                  },
                } as any;
              },
              addEventListener: undefined,
            }),
          }),
        }),
      },
    } as const;
  }

  async subscribe(characteristicUuid: UUID) {
    return this.sendAndWait('subscribe', { type: 'subscribe', characteristic_uuid: characteristicUuid });
  }

  async writeCharacteristic(characteristicUuid: UUID, data: Uint8Array, withResponse = true): Promise<void> {
    const b64 = b64encode(data);
    await this.sendAndWait('write', { type: 'write', characteristic_uuid: characteristicUuid, data: b64, with_response: withResponse });
  }
}

export function buildDefaultProxyWsUrl(path = '/api/v1/ble/ws') {
  const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8080';
  return `${proto}//${host}${path}`;
}
