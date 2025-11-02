/**
 * BLE Proxy Client
 *
 * Provides a Web Bluetooth-like API that communicates with the backend BLE proxy
 * via WebSocket instead of using the browser's Web Bluetooth API directly.
 *
 * This allows iOS/Safari users to access SFP Wizard devices through the backend.
 *
 * Usage:
 *   const proxy = new BLEProxyClient('ws://localhost:8000/api/v1/ble/ws');
 *   await proxy.connect();
 *   const device = await proxy.requestDevice({ services: [SERVICE_UUID] });
 *   // ... same API as Web Bluetooth
 */

class BLEProxyClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.connected = false;
        this.device = null;
        this.messageHandlers = new Map();
        this.notificationCallbacks = new Map();
        this.nextMessageId = 1;
    }

    /**
     * Connect to the WebSocket proxy server.
     * @returns {Promise<void>}
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = () => {
                console.log('[BLE Proxy] Connected to proxy server');
                this.connected = true;
                resolve();
            };

            this.ws.onerror = (error) => {
                console.error('[BLE Proxy] WebSocket error:', error);
                reject(new Error('WebSocket connection failed'));
            };

            this.ws.onclose = () => {
                console.log('[BLE Proxy] Disconnected from proxy server');
                this.connected = false;
                this.device = null;
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };
        });
    }

    /**
     * Handle incoming WebSocket message.
     * @param {Object} message - Message from server
     */
    handleMessage(message) {
        const { type } = message;

        switch (type) {
            case 'connected':
                console.log('[BLE Proxy] Device connected:', message.device_name);
                this.device = {
                    name: message.device_name,
                    address: message.device_address,
                    services: message.services
                };
                this.resolveMessage('connect', message);
                break;

            case 'disconnected':
                console.log('[BLE Proxy] Device disconnected:', message.reason);
                this.device = null;
                this.resolveMessage('disconnect', message);
                break;

            case 'notification':
                const callback = this.notificationCallbacks.get(message.characteristic_uuid);
                if (callback) {
                    // Decode base64 data
                    const data = Uint8Array.from(atob(message.data), c => c.charCodeAt(0));
                    callback(message.characteristic_uuid, data);
                }
                break;

            case 'error':
                console.error('[BLE Proxy] Error:', message.error, message.details);
                this.rejectMessage('error', new Error(message.error));
                break;

            case 'discovered':
                console.log('[BLE Proxy] Discovered devices:', message.devices);
                this.resolveMessage('discover', message.devices);
                break;

            case 'status':
                console.log('[BLE Proxy] Status:', message.message);
                this.resolveMessage('status', message);
                break;

            default:
                console.warn('[BLE Proxy] Unknown message type:', type);
        }
    }

    /**
     * Send a message to the server and wait for response.
     * @param {string} key - Message key for tracking
     * @param {Object} message - Message to send
     * @returns {Promise<any>}
     */
    sendMessage(key, message) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('Not connected to proxy server'));
                return;
            }

            this.messageHandlers.set(key, { resolve, reject });
            this.ws.send(JSON.stringify(message));
        });
    }

    /**
     * Resolve a pending message promise.
     * @param {string} key - Message key
     * @param {any} value - Resolution value
     */
    resolveMessage(key, value) {
        const handler = this.messageHandlers.get(key);
        if (handler) {
            handler.resolve(value);
            this.messageHandlers.delete(key);
        }
    }

    /**
     * Reject a pending message promise.
     * @param {string} key - Message key
     * @param {Error} error - Rejection error
     */
    rejectMessage(key, error) {
        const handler = this.messageHandlers.get(key);
        if (handler) {
            handler.reject(error);
            this.messageHandlers.delete(key);
        }
    }

    /**
     * Request a BLE device (mimics navigator.bluetooth.requestDevice).
     * @param {Object} options - Request options
     * @param {Array<string>} options.services - Service UUIDs
     * @param {string} options.deviceAddress - Optional device address
     * @returns {Promise<Object>} Device object
     */
    async requestDevice(options) {
        const serviceUuid = options.services?.[0];
        if (!serviceUuid) {
            throw new Error('At least one service UUID required');
        }

        // Send connect message
        await this.sendMessage('connect', {
            type: 'connect',
            service_uuid: serviceUuid,
            device_address: options.deviceAddress || null,
            adapter: options.adapter || null
        });

        // Return device-like object
        return {
            name: this.device.name,
            gatt: {
                connect: async () => ({
                    getPrimaryService: async (uuid) => ({
                        getCharacteristic: async (charUuid) => ({
                            uuid: charUuid,
                            writeValueWithoutResponse: async (data) => {
                                await this.writeCharacteristic(charUuid, data, false);
                            },
                            writeValue: async (data) => {
                                await this.writeCharacteristic(charUuid, data, true);
                            },
                            startNotifications: async () => {
                                await this.subscribe(charUuid);
                                return {
                                    addEventListener: (event, callback) => {
                                        if (event === 'characteristicvaluechanged') {
                                            this.notificationCallbacks.set(charUuid, (uuid, data) => {
                                                callback({ target: { value: { buffer: data.buffer } } });
                                            });
                                        }
                                    }
                                };
                            },
                            stopNotifications: async () => {
                                await this.unsubscribe(charUuid);
                            }
                        })
                    })
                })
            }
        };
    }

    /**
     * Write data to a characteristic.
     * @param {string} characteristicUuid - Characteristic UUID
     * @param {ArrayBuffer|Uint8Array} data - Data to write
     * @param {boolean} withResponse - Wait for response
     * @returns {Promise<void>}
     */
    async writeCharacteristic(characteristicUuid, data, withResponse = false) {
        // Convert to Uint8Array if needed
        const uint8Array = data instanceof Uint8Array ? data : new Uint8Array(data);

        // Encode as base64
        const base64Data = btoa(String.fromCharCode(...uint8Array));

        await this.sendMessage('write', {
            type: 'write',
            characteristic_uuid: characteristicUuid,
            data: base64Data,
            with_response: withResponse
        });
    }

    /**
     * Subscribe to notifications from a characteristic.
     * @param {string} characteristicUuid - Characteristic UUID
     * @returns {Promise<void>}
     */
    async subscribe(characteristicUuid) {
        await this.sendMessage('subscribe', {
            type: 'subscribe',
            characteristic_uuid: characteristicUuid
        });
    }

    /**
     * Unsubscribe from notifications.
     * @param {string} characteristicUuid - Characteristic UUID
     * @returns {Promise<void>}
     */
    async unsubscribe(characteristicUuid) {
        await this.sendMessage('unsubscribe', {
            type: 'unsubscribe',
            characteristic_uuid: characteristicUuid
        });
    }

    /**
     * Discover nearby BLE devices.
     * @param {Object} options - Discovery options
     * @param {string} options.serviceUuid - Service UUID filter
     * @param {number} options.timeout - Timeout in seconds
     * @returns {Promise<Array>} List of discovered devices
     */
    async discoverDevices(options = {}) {
        return await this.sendMessage('discover', {
            type: 'discover',
            service_uuid: options.serviceUuid || null,
            timeout: options.timeout || 5,
            adapter: options.adapter || null
        });
    }

    /**
     * Disconnect from the current device.
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (this.device) {
            await this.sendMessage('disconnect', {
                type: 'disconnect'
            });
        }
    }

    /**
     * Close the WebSocket connection.
     */
    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
            this.device = null;
        }
    }

    /**
     * Check if proxy mode is available (always true for this client).
     * @returns {boolean}
     */
    static isAvailable() {
        return typeof WebSocket !== 'undefined';
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BLEProxyClient;
}
